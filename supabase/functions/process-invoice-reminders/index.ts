/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? '';
const META_WHATSAPP_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN') ?? '';
const META_WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID') ?? '';
const META_WHATSAPP_TEMPLATE_NAME = Deno.env.get('META_WHATSAPP_TEMPLATE_NAME') ?? '';
const META_WHATSAPP_LANGUAGE_CODE = Deno.env.get('META_WHATSAPP_LANGUAGE_CODE') ?? 'en';
const TERMII_API_KEY = Deno.env.get('TERMII_API_KEY') ?? '';
const TERMII_SENDER_ID = Deno.env.get('TERMII_SENDER_ID') ?? '';

const MAX_ATTEMPTS = 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ReminderTask = {
  out_reminder_id: string;
  out_invoice_id: string;
  out_user_id: string;
  out_customer_name: string;
  out_customer_email: string;
  out_customer_phone: string;
  out_amount_kobo: number;
  out_balance_kobo: number;
  out_due_date: string;
  out_stage: string;
  out_channel: 'email' | 'whatsapp' | 'sms';
  out_custom_note: string;
  out_attempt_count: number;
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

function formatNairaFromKobo(amountKobo: number): string {
  const naira = Math.floor(amountKobo / 100);
  return `₦${naira.toLocaleString('en-NG')}`;
}

function cleanPhone(rawPhone: string): string {
  return rawPhone.replace(/[^0-9+]/g, '').replace(/^00/, '+');
}

function buildMessage(task: ReminderTask): string {
  const invoiceAmount = formatNairaFromKobo(Number(task.out_balance_kobo));
  const dueDate = new Date(task.out_due_date).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const greeting = task.out_customer_name ? `Hello ${task.out_customer_name},` : 'Hello,';
  const stageText = task.out_stage === 'before_due'
    ? 'This is a friendly reminder that your invoice is due soon.'
    : task.out_stage === 'due_date'
    ? 'This is a friendly reminder that your invoice is due today.'
    : `This is a reminder that your invoice is overdue (${task.out_stage.replace('_', ' ')}).`;
  const note = task.out_custom_note ? `\n\n${task.out_custom_note}` : '';
  return `${greeting}\n${stageText}\nOutstanding balance: ${invoiceAmount}\nDue date: ${dueDate}${note}\n\nThank you.`;
}

async function sendEmail(task: ReminderTask, message: string): Promise<{ providerMessageId: string }> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) throw new Error('Email channel not configured: RESEND_API_KEY or RESEND_FROM_EMAIL is missing.');
  const html = message.split('\n').map(escapeHtml).join('<br>');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `paychaser-reminder-${task.out_reminder_id}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [task.out_customer_email],
      subject: `Invoice reminder: ${task.out_stage.replace('_', ' ')}`,
      text: message,
      html: `<div>${html}</div>`,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Resend API ${response.status}: ${JSON.stringify(data)}`);
  if (!data.id) throw new Error('Resend response did not include a message ID.');
  return { providerMessageId: String(data.id) };
}

async function sendWhatsApp(task: ReminderTask, message: string): Promise<{ providerMessageId: string }> {
  if (!META_WHATSAPP_TOKEN || !META_WHATSAPP_PHONE_NUMBER_ID || !META_WHATSAPP_TEMPLATE_NAME) {
    throw new Error('WhatsApp channel not configured: Meta WhatsApp credentials or approved template are missing.');
  }
  const phone = cleanPhone(task.out_customer_phone).replace(/^\+/, '');
  if (!phone) throw new Error('Customer WhatsApp phone number is missing.');

  const response = await fetch(`https://graph.facebook.com/v21.0/${META_WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: META_WHATSAPP_TEMPLATE_NAME,
        language: { code: META_WHATSAPP_LANGUAGE_CODE },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: task.out_customer_name || 'Customer' },
              { type: 'text', text: formatNairaFromKobo(Number(task.out_balance_kobo)) },
              { type: 'text', text: task.out_due_date },
              { type: 'text', text: message },
            ],
          },
        ],
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Meta WhatsApp API ${response.status}: ${JSON.stringify(data)}`);
  const messageId = data.messages?.[0]?.id;
  if (!messageId) throw new Error('WhatsApp API response did not include a message ID.');
  return { providerMessageId: String(messageId) };
}

async function sendSms(task: ReminderTask, message: string): Promise<{ providerMessageId: string }> {
  if (!TERMII_API_KEY || !TERMII_SENDER_ID) throw new Error('SMS channel not configured: TERMII_API_KEY or TERMII_SENDER_ID is missing.');
  const phone = cleanPhone(task.out_customer_phone);
  if (!phone) throw new Error('Customer SMS phone number is missing.');

  const response = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `paychaser-reminder-${task.out_reminder_id}`,
    },
    body: JSON.stringify({
      to: phone,
      from: TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: TERMII_API_KEY,
    }),
  });
  const data = await response.json();
  if (!response.ok || data.code !== 'ok') throw new Error(`Termii API ${response.status}: ${JSON.stringify(data)}`);
  const messageId = data.message_id ?? data.messageId ?? data.message_id_str;
  if (!messageId) throw new Error('Termii response did not include a message ID.');
  return { providerMessageId: String(messageId) };
}

async function reportResult(task: ReminderTask, status: 'delivered' | 'failed' | 'not_configured' | 'skipped', providerMessageId?: string, error?: string) {
  const { error: dbError } = await supabase.rpc('record_reminder_delivery_result', {
    p_reminder_id: task.out_reminder_id,
    p_status: status,
    p_provider_message_id: providerMessageId ?? null,
    p_error_message: error ?? null,
  });
  if (dbError) console.error('Failed to persist reminder result:', dbError.message, task.out_reminder_id);
}

async function isStillEligible(task: ReminderTask): Promise<boolean> {
  const { data, error } = await supabase
    .from('pc_invoices')
    .select('status, balance_kobo, customer_email, customer_phone')
    .eq('id', task.out_invoice_id)
    .eq('user_id', task.out_user_id)
    .maybeSingle();
  if (error || !data) return false;
  if (!['sent', 'unpaid'].includes(data.status) || Number(data.balance_kobo ?? 0) <= 0) return false;
  if (task.out_channel === 'email' && !data.customer_email) return false;
  if ((task.out_channel === 'sms' || task.out_channel === 'whatsapp') && !data.customer_phone) return false;
  return true;
}

async function processTask(task: ReminderTask) {
  // Re-check invoice eligibility immediately before dispatch to stop reminders after payment/cancellation.
  if (!(await isStillEligible(task))) {
    await reportResult(task, 'skipped', undefined, 'Invoice became ineligible before dispatch.');
    return { status: 'skipped' };
  }

  const message = buildMessage(task);
  try {
    let result: { providerMessageId: string };
    if (task.out_channel === 'email') result = await sendEmail(task, message);
    else if (task.out_channel === 'whatsapp') result = await sendWhatsApp(task, message);
    else result = await sendSms(task, message);

    await reportResult(task, 'delivered', result.providerMessageId);
    return { status: 'accepted_by_provider', channel: task.out_channel, reminder_id: task.out_reminder_id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const notConfigured = detail.toLowerCase().includes('not configured');
    await reportResult(task, notConfigured ? 'not_configured' : 'failed', undefined, detail);
    return { status: notConfigured ? 'not_configured' : 'failed', channel: task.out_channel, reminder_id: task.out_reminder_id, error: detail };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
    return Response.json({ error: 'Scheduler not configured: missing Supabase backend or CRON_SECRET.' }, { status: 503 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== CRON_SECRET) return new Response('Unauthorized', { status: 401 });

  const { data: tasks, error } = await supabase.rpc('claim_due_invoice_reminders', { p_limit: 50 });
  if (error) {
    console.error('Unable to claim reminders:', error.message);
    return Response.json({ error: 'Unable to claim reminder work.' }, { status: 500 });
  }

  const results = await Promise.all((tasks ?? []).map((task: ReminderTask) => processTask(task)));
  const counts = results.reduce((acc: Record<string, number>, result: any) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});
  return Response.json({ claimed: tasks?.length ?? 0, results: counts });
});
