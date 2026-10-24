/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") || "Eminent Clicks <notifications@eminentclick.com.ng>";
const META_WHATSAPP_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const META_WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "";
const META_WHATSAPP_TEMPLATE_NAME = Deno.env.get("META_WHATSAPP_TEMPLATE_NAME") ?? "";
const META_WHATSAPP_LANGUAGE_CODE = Deno.env.get("META_WHATSAPP_LANGUAGE_CODE") ?? "en";
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY") ?? "";
const TERMII_SENDER_ID = Deno.env.get("TERMII_SENDER_ID") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
  out_channel: "email" | "whatsapp" | "sms";
  out_custom_note: string;
  out_attempt_count: number;
};

function escapeHtml(input: string): string {
  return input.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

function formatNairaFromKobo(amountKobo: number): string {
  const naira = Math.floor(amountKobo / 100);
  return `₦${naira.toLocaleString("en-NG")}`;
}

function cleanPhone(rawPhone: string): string {
  return rawPhone.replace(/[^0-9+]/g, "").replace(/^00/, "+");
}

function buildReminderMessage(task: ReminderTask): { subject: string; text: string; html: string } {
  const invoiceAmount = formatNairaFromKobo(Number(task.out_balance_kobo));
  const dueDate = new Date(task.out_due_date).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const greeting = task.out_customer_name ? `Hello ${task.out_customer_name},` : "Hello,";

  let stageTitle = "Invoice Reminder";
  let stageLead = "This is a friendly reminder that your invoice is due soon.";
  if (task.out_stage === "due_date") {
    stageTitle = "Invoice Due Today";
    stageLead = "This is a reminder that your invoice is due today.";
  } else if (task.out_stage.startsWith("overdue")) {
    const days = task.out_stage.replace("overdue_", "");
    stageTitle = `Invoice Overdue (${days} Days)`;
    stageLead = `This is an urgent reminder that your invoice is now ${days} days overdue.`;
  }

  const note = task.out_custom_note ? `\n\nPayment Details / Notes:\n${task.out_custom_note}` : "";
  const text = `${greeting}\n\n${stageLead}\nOutstanding Balance: ${invoiceAmount}\nDue Date: ${dueDate}${note}\n\nKindly settle payment at your earliest convenience.\n\nThank you,\nEminent Clicks Operations`;

  const safeCustomer = escapeHtml(task.out_customer_name || "Valued Customer");
  const safeNote = task.out_custom_note
    ? escapeHtml(task.out_custom_note).replace(/\n/g, "<br/>")
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1E293B;">
  <div style="max-width:560px;margin:32px auto;background:#FFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
    <div style="background:#192639;padding:24px 32px;color:#FFF;">
      <h2 style="margin:0;font-size:18px;">EMINENT CLICKS</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#D1DCE5;">PayChaser Automated Reminder</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;">Hello <strong>${safeCustomer}</strong>,</p>
      <p style="color:#475569;margin:0 0 24px;">${escapeHtml(stageLead)}</p>
      <div style="background:#F1F5F9;padding:20px;border-radius:8px;margin-bottom:24px;">
        <div style="font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;">Outstanding Balance</div>
        <div style="font-size:26px;font-weight:800;color:#192639;margin:4px 0;">${invoiceAmount}</div>
        <div style="font-size:12px;color:#64748B;">Due Date: ${dueDate}</div>
      </div>
      ${safeNote ? `<div style="background:#F8FAFC;border-left:4px solid #192639;padding:12px;margin-bottom:24px;font-size:13px;">${safeNote}</div>` : ""}
      <p style="color:#64748B;font-size:13px;margin:0;">Kindly arrange payment at your earliest convenience.</p>
    </div>
    <div style="background:#F8FAFC;padding:16px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #E2E8F0;">
      Sent via Eminent Clicks &bull; ${escapeHtml(RESEND_FROM_EMAIL)}
    </div>
  </div>
</body>
</html>`;

  return { subject: `${stageTitle}: Outstanding Balance ${invoiceAmount}`, text, html };
}

async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
  idempotencyKey?: string,
): Promise<{ providerMessageId: string }> {
  if (!RESEND_API_KEY) {
    throw new Error(
      "Email channel not configured: RESEND_API_KEY is missing from backend secrets.",
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${JSON.stringify(data)}`);
  }
  if (!data.id) {
    throw new Error("Resend response did not return a message ID.");
  }
  return { providerMessageId: String(data.id) };
}

async function reportResult(
  task: ReminderTask,
  status: "provider_accepted" | "delivered" | "failed" | "not_configured" | "skipped",
  providerMessageId?: string,
  error?: string,
) {
  const { error: dbError } = await supabaseAdmin.rpc("record_reminder_delivery_result", {
    p_reminder_id: task.out_reminder_id,
    p_status: status,
    p_provider_message_id: providerMessageId ?? null,
    p_error_message: error ?? null,
  });
  if (dbError) {
    console.error("Failed to persist reminder result:", dbError.message, task.out_reminder_id);
  }
}

async function isStillEligible(task: ReminderTask): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("pc_invoices")
    .select("status, balance_kobo, customer_email, customer_phone")
    .eq("id", task.out_invoice_id)
    .eq("user_id", task.out_user_id)
    .maybeSingle();
  if (error || !data) return false;
  if (!["sent", "unpaid"].includes(data.status) || Number(data.balance_kobo ?? 0) <= 0)
    return false;
  if (task.out_channel === "email" && !data.customer_email) return false;
  if ((task.out_channel === "sms" || task.out_channel === "whatsapp") && !data.customer_phone)
    return false;
  return true;
}

async function processTask(task: ReminderTask) {
  if (!(await isStillEligible(task))) {
    await reportResult(task, "skipped", undefined, "Invoice became ineligible before dispatch.");
    return { status: "skipped", channel: task.out_channel, reminder_id: task.out_reminder_id };
  }

  // Strictly enforce email-only scope for this phase
  if (task.out_channel !== "email") {
    await reportResult(
      task,
      "not_configured",
      undefined,
      `${task.out_channel} delivery channel is currently disabled/unconfigured.`,
    );
    return {
      status: "not_configured",
      channel: task.out_channel,
      reminder_id: task.out_reminder_id,
    };
  }

  const { subject, text, html } = buildReminderMessage(task);
  try {
    const result = await sendEmailViaResend(
      task.out_customer_email,
      subject,
      html,
      text,
      `paychaser-reminder-${task.out_reminder_id}-att-${task.out_attempt_count}`,
    );

    // Truthful status: provider accepted the email, not inbox delivery
    await reportResult(task, "provider_accepted", result.providerMessageId);
    return {
      status: "provider_accepted",
      channel: task.out_channel,
      reminder_id: task.out_reminder_id,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const notConfigured = detail.toLowerCase().includes("not configured");
    await reportResult(task, notConfigured ? "not_configured" : "failed", undefined, detail);
    return {
      status: notConfigured ? "not_configured" : "failed",
      channel: task.out_channel,
      reminder_id: task.out_reminder_id,
      error: detail,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  // 1. Action: Manual Reminder Check from PayChaser UI ("Check Invoices Now")
  if (body?.action === "check_reminders_manual") {
    if (!token) {
      return Response.json(
        { error: "Unauthorized: authentication token required." },
        { status: 401, headers: corsHeaders },
      );
    }

    // Verify user JWT server-side and derive user identity
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return Response.json(
        { error: "Unauthorized user session." },
        { status: 401, headers: corsHeaders },
      );
    }

    if (!RESEND_API_KEY) {
      return Response.json(
        {
          status: "not_configured",
          message: "Resend API key is not configured in Supabase secrets.",
        },
        { status: 200, headers: corsHeaders },
      );
    }

    // Claim due reminders specifically for the authenticated user only
    const { data: tasks, error: claimErr } = await supabaseAdmin.rpc(
      "claim_due_invoice_reminders",
      {
        p_limit: 20,
        p_target_user_id: user.id,
      },
    );

    if (claimErr) {
      console.error("Error claiming reminders for user:", claimErr.message);
      return Response.json({ error: claimErr.message }, { status: 500, headers: corsHeaders });
    }

    const results = await Promise.all((tasks ?? []).map((task: ReminderTask) => processTask(task)));
    const counts = results.reduce((acc: Record<string, number>, result: any) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {});

    return Response.json(
      {
        status: "success",
        claimed: tasks?.length ?? 0,
        results: counts,
      },
      { status: 200, headers: corsHeaders },
    );
  }

  // 2. Action: Direct Invoice Email (e.g. from JobFlow conversion)
  if (body?.action === "send_invoice") {
    if (!token) {
      return Response.json(
        { error: "Unauthorized: authentication token required." },
        { status: 401, headers: corsHeaders },
      );
    }

    // Verify authenticated user
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return Response.json(
        { error: "Unauthorized user session." },
        { status: 401, headers: corsHeaders },
      );
    }

    const {
      invoice_id,
      customer_email,
      customer_name,
      invoice_number,
      balance_kobo,
      due_date,
      job_title,
      notes,
    } = body;
    if (!invoice_id || !customer_email) {
      return Response.json(
        { error: "Missing required invoice parameters." },
        { status: 400, headers: corsHeaders },
      );
    }

    // Security check: ensure invoice exists and belongs to the authenticated user
    const { data: invoice, error: invErr } = await userClient
      .from("pc_invoices")
      .select("id, user_id, customer, customer_email, amount_kobo, balance_kobo, due_date")
      .eq("id", invoice_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invErr || !invoice) {
      return Response.json(
        { error: "Invoice not found or access denied." },
        { status: 404, headers: corsHeaders },
      );
    }

    if (!RESEND_API_KEY) {
      return Response.json(
        {
          status: "not_configured",
          message: "Resend API key is not configured in Supabase secrets.",
        },
        { status: 200, headers: corsHeaders },
      );
    }

    const formattedBalance = formatNairaFromKobo(Number(balance_kobo || invoice.balance_kobo));
    const safeNumber = escapeHtml(String(invoice_number || ""));
    const safeCustomer = escapeHtml(customer_name || invoice.customer || "Valued Client");
    const safeNotes = notes ? escapeHtml(String(notes)).replace(/\n/g, "<br/>") : "";

    const subject = `Invoice #${safeNumber} from Eminent Clicks`;
    const text = `Hello ${customer_name || invoice.customer},\n\nAn invoice (#${safeNumber}) has been generated for you.\nTotal Amount: ${formattedBalance}\nDue Date: ${due_date || invoice.due_date}\n\n${notes ? `Notes:\n${notes}\n\n` : ""}Thank you,\nEminent Clicks Operations`;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1E293B;">
  <div style="max-width:560px;margin:32px auto;background:#FFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
    <div style="background:#192639;padding:24px 32px;color:#FFF;">
      <h2 style="margin:0;font-size:18px;">EMINENT CLICKS</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#D1DCE5;">Invoice Notice</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;">Hello <strong>${safeCustomer}</strong>,</p>
      <p style="color:#475569;margin:0 0 24px;">An invoice has been generated for you${job_title ? ` regarding <strong>${escapeHtml(job_title)}</strong>` : ""}.</p>
      <div style="background:#F1F5F9;padding:20px;border-radius:8px;margin-bottom:24px;">
        <div style="font-size:12px;color:#64748B;font-weight:600;text-transform:uppercase;">Total Amount Due</div>
        <div style="font-size:26px;font-weight:800;color:#267A62;margin:4px 0;">${formattedBalance}</div>
        <div style="font-size:12px;color:#64748B;">Invoice #${safeNumber} &bull; Due: ${due_date || invoice.due_date}</div>
      </div>
      ${safeNotes ? `<div style="background:#F8FAFC;border-left:4px solid #E4B94F;padding:12px;margin-bottom:24px;font-size:13px;">${safeNotes}</div>` : ""}
      <p style="color:#64748B;font-size:13px;margin:0;">Kindly arrange payment on or before the due date.</p>
    </div>
    <div style="background:#F8FAFC;padding:16px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #E2E8F0;">
      Sent via Eminent Clicks &bull; ${escapeHtml(RESEND_FROM_EMAIL)}
    </div>
  </div>
</body>
</html>`;

    try {
      const emailRes = await sendEmailViaResend(
        customer_email,
        subject,
        html,
        text,
        `paychaser-invoice-${invoice.id}`,
      );
      return Response.json(
        {
          status: "provider_accepted",
          provider_message_id: emailRes.providerMessageId,
          message: "Invoice email accepted by provider.",
        },
        { headers: corsHeaders },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return Response.json(
        { status: "failed", error: errMsg },
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 3. Cron / Scheduled processing (authenticated with CRON_SECRET or service-role key)
  const isCron = CRON_SECRET && token === CRON_SECRET;
  const isServiceRole = SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY;
  if (!isCron && !isServiceRole) {
    return new Response("Unauthorized: CRON_SECRET or service role authorization required.", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { data: tasks, error: claimErr } = await supabaseAdmin.rpc("claim_due_invoice_reminders", {
    p_limit: 50,
    p_target_user_id: null,
  });

  if (claimErr) {
    console.error("Unable to claim scheduled reminders:", claimErr.message);
    return Response.json(
      { error: "Unable to claim reminder work: " + claimErr.message },
      { status: 500, headers: corsHeaders },
    );
  }

  const results = await Promise.all((tasks ?? []).map((task: ReminderTask) => processTask(task)));
  const counts = results.reduce((acc: Record<string, number>, result: any) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});

  return Response.json(
    {
      status: "success",
      claimed: tasks?.length ?? 0,
      results: counts,
    },
    { headers: corsHeaders },
  );
});
