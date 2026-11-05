/**
 * PayChaser automated reminder engine (server-only logic).
 *
 * Shared by:
 *  - the scheduled cron route (/api/public/jobs/process-invoice-reminders), and
 *  - the authenticated "Check Invoices Now" server function.
 *
 * Flow: claim due reminder tasks (duplicate-safe, in the database), recover any
 * tasks stuck in "sending" from an earlier crash, re-check each invoice is still
 * eligible, dispatch through the configured provider, then record the delivery
 * result (delivered / failed / not_configured / skipped) with audit logging.
 *
 * Provider secrets are read from server-side environment variables only and are
 * never exposed to the browser. A channel without its secrets is recorded as
 * `not_configured` — never as delivered.
 */

export type ReminderTask = {
  out_reminder_id: string;
  out_invoice_id: string;
  out_user_id: string;
  out_customer_name: string;
  out_customer_email: string;
  out_customer_phone: string;
  out_amount_kobo: number;
  out_balance_kobo: number;
  out_due_date: string;
  out_invoice_number: string;
  out_business_name: string;
  out_stage: string;
  out_channel: "email" | "whatsapp" | "sms";
  out_custom_note: string;
  out_attempt_count: number;
};

export type TaskOutcome = {
  reminder_id: string;
  invoice_id: string;
  customer: string;
  stage: string;
  channel: string;
  status: "delivered" | "failed" | "not_configured" | "skipped";
  provider_message_id?: string;
  error?: string;
};

export type SweepSummary = {
  claimed: number;
  recovered: number;
  counts: Record<string, number>;
  results: TaskOutcome[];
};

/** Stale rows claimed but never completed (e.g. a crashed run) older than this are recovered. */
const STALE_SENDING_MINUTES = 30;
/** A stage/channel stops retrying after this many failed delivery attempts (enforced in the database too). */
const MAX_FAILED_ATTEMPTS = 5;

type AdminClient = Awaited<ReturnType<typeof loadAdmin>>;

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function formatNairaFromKobo(amountKobo: number): string {
  const naira = Number(amountKobo) / 100;
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function stageText(stage: string, dueDate: string): string {
  if (stage === "before_due") return `a friendly reminder that this invoice is due on ${dueDate}`;
  if (stage === "due_date") return "a friendly reminder that this invoice is due today";
  const label = stage.replace("overdue_", "").replace("_", " ");
  return `a reminder that this invoice is now ${label} day(s) overdue`;
}

export function buildReminderMessage(invoice: {
  customer: string;
  invoice_number: string;
  amount_kobo: number;
  balance_kobo: number;
  due_date: string;
}, task: ReminderTask): string {
  const customer = invoice.customer || task.out_customer_name || "";
  const greeting = customer ? `Hello ${customer},` : "Hello,";
  const due = formatDate(invoice.due_date);
  const business = task.out_business_name;
  const fromLine = business ? ` from ${business}` : "";
  const balance = formatNairaFromKobo(invoice.balance_kobo);
  const total = formatNairaFromKobo(invoice.amount_kobo);
  const amountLine =
    Number(invoice.balance_kobo) < Number(invoice.amount_kobo)
      ? `Outstanding balance: ${balance} (of ${total} invoiced).`
      : `Outstanding balance: ${balance}.`;

  const lines = [
    greeting,
    `This is ${stageText(task.out_stage, due)}${fromLine}.`,
    `Invoice number: ${invoice.invoice_number}.`,
    amountLine,
    `Due date: ${due}.`,
  ];
  if (task.out_custom_note) lines.push("", task.out_custom_note);
  lines.push("", "Kindly make payment at your earliest convenience. Thank you.");
  if (business) lines.push(`— ${business}`);
  return lines.join("\n");
}

function cleanPhone(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, "").replace(/^00/, "+");
  return digits;
}

function isNotConfiguredError(message: string): boolean {
  return message.toLowerCase().includes("not configured");
}

async function sendEmail(task: ReminderTask, message: string): Promise<string> {
  const apiKey = process.env["RESEND_API_KEY"];
  const fromEmail = process.env["RESEND_FROM_EMAIL"];
  if (!apiKey || !fromEmail) {
    throw new Error("Email channel not configured: RESEND_API_KEY or RESEND_FROM_EMAIL is missing.");
  }
  const recipient = task.out_customer_email;
  const html = `<div>${message
    .split("\n")
    .map((l) => l.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c))
    .join("<br />")}</div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `paychaser-reminder-${task.out_reminder_id}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject: `Invoice ${task.out_invoice_number}: payment reminder (${task.out_stage.replace("_", " ")})`,
      text: message,
      html,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend API ${response.status}: ${JSON.stringify(body)}`);
  if (!body?.id) throw new Error("Resend response did not include a message ID.");
  return String(body.id);
}

async function sendWhatsApp(task: ReminderTask, message: string): Promise<string> {
  const token = process.env["META_WHATSAPP_TOKEN"];
  const phoneNumberId = process.env["META_WHATSAPP_PHONE_NUMBER_ID"];
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp channel not configured: META_WHATSAPP_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID is missing.");
  }
  const phone = cleanPhone(task.out_customer_phone).replace(/^\+/, "");
  if (!phone) throw new Error("Customer WhatsApp phone number is missing.");

  const templateName = process.env["META_WHATSAPP_TEMPLATE_NAME"];
  const languageCode = process.env["META_WHATSAPP_LANGUAGE_CODE"] || "en";
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: phone,
    ...(templateName
      ? {
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: task.out_customer_name || "Customer" },
                  { type: "text", text: formatNairaFromKobo(task.out_balance_kobo) },
                  { type: "text", text: task.out_due_date },
                  { type: "text", text: message },
                ],
              },
            ],
          },
        }
      : { type: "text", text: { body: message } }),
  };
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meta WhatsApp API ${response.status}: ${JSON.stringify(body)}`);
  const messageId = body?.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp API response did not include a message ID.");
  return String(messageId);
}

async function sendSms(task: ReminderTask, message: string): Promise<string> {
  const apiKey = process.env["TERMII_API_KEY"];
  const senderId = process.env["TERMII_SENDER_ID"];
  if (!apiKey || !senderId) {
    throw new Error("SMS channel not configured: TERMII_API_KEY or TERMII_SENDER_ID is missing.");
  }
  const phone = cleanPhone(task.out_customer_phone).replace(/^\+/, "");
  if (!phone) throw new Error("Customer SMS phone number is missing.");
  const response = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `paychaser-reminder-${task.out_reminder_id}`,
    },
    body: JSON.stringify({
      to: phone,
      from: senderId,
      sms: message,
      type: "plain",
      channel: "generic",
      api_key: apiKey,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.code !== "ok") throw new Error(`Termii API ${response.status}: ${JSON.stringify(body)}`);
  const messageId = body?.message_id ?? body?.messageId;
  if (!messageId) throw new Error("Termii response did not include a message ID.");
  return String(messageId);
}

async function recordResult(
  admin: AdminClient,
  task: ReminderTask,
  status: "delivered" | "failed" | "not_configured" | "skipped",
  providerMessageId?: string,
  error?: string
): Promise<void> {
  const { error: dbError } = await admin.rpc("record_reminder_delivery_result", {
    p_reminder_id: task.out_reminder_id,
    p_status: status,
    p_provider_message_id: providerMessageId ?? null,
    p_error_message: error ?? null,
  });
  if (dbError) {
    console.error(`[reminders] failed to persist result for ${task.out_reminder_id}:`, dbError.message);
  }
}

async function processTask(task: ReminderTask, admin: AdminClient): Promise<TaskOutcome> {
  const base = {
    reminder_id: task.out_reminder_id,
    invoice_id: task.out_invoice_id,
    customer: task.out_customer_name,
    stage: task.out_stage,
    channel: task.out_channel,
  };

  // Re-check eligibility immediately before dispatch so paid/cancelled invoices get nothing.
  const { data: invoice, error: invError } = await admin
    .from("pc_invoices")
    .select("status, balance_kobo, customer, customer_email, customer_phone, amount_kobo, due_date, invoice_number")
    .eq("id", task.out_invoice_id)
    .maybeSingle();

  if (invError) {
    await recordResult(admin, task, "failed", undefined, `Could not re-check invoice: ${invError.message}`);
    return { ...base, status: "failed", error: invError.message };
  }
  if (!invoice) {
    await recordResult(admin, task, "skipped", undefined, "Invoice no longer exists.");
    return { ...base, status: "skipped", error: "Invoice no longer exists." };
  }
  if (!["sent", "unpaid"].includes(invoice.status) || Number(invoice.balance_kobo ?? 0) <= 0) {
    await recordResult(admin, task, "skipped", undefined, "Invoice is paid, cancelled or fully settled — no reminder sent.");
    return { ...base, status: "skipped", error: "Invoice is no longer outstanding." };
  }
  if (task.out_channel === "email" && !invoice.customer_email) {
    await recordResult(admin, task, "skipped", undefined, "Invoice has no customer email address.");
    return { ...base, status: "skipped", error: "No customer email on this invoice." };
  }
  if ((task.out_channel === "sms" || task.out_channel === "whatsapp") && !invoice.customer_phone) {
    await recordResult(admin, task, "skipped", undefined, "Invoice has no customer phone number.");
    return { ...base, status: "skipped", error: "No customer phone on this invoice." };
  }

  const message = buildReminderMessage(
    {
      customer: invoice.customer,
      invoice_number: invoice.invoice_number,
      amount_kobo: invoice.amount_kobo,
      balance_kobo: invoice.balance_kobo,
      due_date: invoice.due_date,
    },
    task
  );

  try {
    let providerMessageId: string;
    if (task.out_channel === "email") providerMessageId = await sendEmail(task, message);
    else if (task.out_channel === "whatsapp") providerMessageId = await sendWhatsApp(task, message);
    else providerMessageId = await sendSms(task, message);

    await recordResult(admin, task, "delivered", providerMessageId);
    return { ...base, status: "delivered", provider_message_id: providerMessageId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const status = isNotConfiguredError(detail) ? "not_configured" : "failed";
    await recordResult(admin, task, status, undefined, detail);
    return { ...base, status, error: detail };
  }
}

/** Claim due tasks through the database function (duplicate-safe). */
async function claimDueTasks(claimClient: AdminClient, limit: number): Promise<ReminderTask[]> {
  const { data, error } = await claimClient.rpc("claim_due_invoice_reminders", { p_limit: limit });
  if (error) throw new Error(`Unable to claim reminder tasks: ${error.message}`);
  return (data ?? []) as unknown as ReminderTask[];
}

/**
 * Recover tasks stuck in "sending" from an earlier crashed/disconnected run.
 * The stale-row update is an atomic re-claim: only rows still older than the
 * cutoff are flipped to a fresh attempt, so concurrent sweeps cannot double-send.
 */
async function recoverStaleTasks(admin: AdminClient, onlyUserId?: string): Promise<ReminderTask[]> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MINUTES * 60_000).toISOString();
  let query = admin
    .from("pc_reminders")
    .update({ last_attempt_at: new Date().toISOString(), attempt_count: 1 })
    .eq("status", "sending")
    .lt("last_attempt_at", cutoff)
    .select("id, invoice_id, user_id, stage, channel, recipient");
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data: stale, error } = await query;
  if (error) throw new Error(`Unable to recover stale reminder tasks: ${error.message}`);
  if (!stale?.length) return [];

  const tasks: ReminderTask[] = [];
  for (const row of stale) {
    const [{ data: invoice }, { data: settings }] = await Promise.all([
      admin
        .from("pc_invoices")
        .select("customer, customer_email, customer_phone, amount_kobo, balance_kobo, due_date, invoice_number")
        .eq("id", row.invoice_id)
        .maybeSingle(),
      admin
        .from("pc_reminder_settings")
        .select("custom_note")
        .eq("user_id", row.user_id)
        .maybeSingle(),
    ]);
    if (!invoice) continue;
    tasks.push({
      out_reminder_id: row.id,
      out_invoice_id: row.invoice_id,
      out_user_id: row.user_id,
      out_customer_name: invoice.customer ?? "",
      out_customer_email: invoice.customer_email ?? "",
      out_customer_phone: invoice.customer_phone ?? "",
      out_amount_kobo: invoice.amount_kobo,
      out_balance_kobo: invoice.balance_kobo,
      out_due_date: invoice.due_date,
      out_invoice_number: invoice.invoice_number ?? "",
      out_business_name: "",
      out_stage: row.stage,
      out_channel: row.channel,
      out_custom_note: settings?.custom_note ?? "",
      out_attempt_count: row.attempt_count ?? 1,
    });
  }
  return tasks;
}

/**
 * Run one full reminder sweep: claim, recover, dispatch, record.
 * `claimClient` decides scope: the service role claims for every user; a user
 * JWT claims only that user's invoices (the database enforces this).
 */
export async function runReminderSweep(options: {
  claimClient: AdminClient;
  limit?: number;
  recoverOnlyUserId?: string;
}): Promise<SweepSummary> {
  const admin = await loadAdmin();
  const claimed = await claimDueTasks(options.claimClient, options.limit ?? 50);
  const recovered = await recoverStaleTasks(admin, options.recoverOnlyUserId);
  const tasks = [...claimed, ...recovered];

  const results: TaskOutcome[] = [];
  for (const task of tasks) {
    results.push(await processTask(task, admin));
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  return { claimed: claimed.length, recovered: recovered.length, counts, results };
}

export { MAX_FAILED_ATTEMPTS, STALE_SENDING_MINUTES };
