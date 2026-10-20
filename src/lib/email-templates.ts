import { formatNaira, formatDate } from "./format";

export const DEFAULT_SENDER_EMAIL = "notifications@eminentclick.com.ng";
export const DEFAULT_SENDER_NAME = "Eminent Clicks";
export const DEFAULT_FROM_HEADER = `${DEFAULT_SENDER_NAME} <${DEFAULT_SENDER_EMAIL}>`;

export interface InvoiceEmailParams {
  customerName: string;
  customerEmail: string;
  invoiceNumber: string;
  amountKobo: number;
  balanceKobo: number;
  dueDate: string;
  jobTitle?: string;
  notes?: string;
  customBankDetails?: string;
}

export interface ReminderEmailParams {
  customerName: string;
  customerEmail: string;
  invoiceNumber: string;
  balanceKobo: number;
  originalAmountKobo: number;
  dueDate: string;
  stage: "before_due" | "due_date" | "overdue_3" | "overdue_7" | "overdue_14" | string;
  customNote?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateInvoiceEmail(params: InvoiceEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeCustomer = escapeHtml(params.customerName || "Valued Client");
  const safeNumber = escapeHtml(params.invoiceNumber);
  const formattedBalance = formatNaira(params.balanceKobo);
  const formattedDueDate = formatDate(params.dueDate);
  const safeJobTitle = params.jobTitle ? escapeHtml(params.jobTitle) : "";
  const safeNotes = params.notes ? escapeHtml(params.notes).replace(/\n/g, "<br/>") : "";
  const safeBankDetails = params.customBankDetails
    ? escapeHtml(params.customBankDetails).replace(/\n/g, "<br/>")
    : "";

  const subject = `Invoice #${params.invoiceNumber} from Eminent Clicks`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color:#192639;padding:28px 32px;text-align:left;">
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">EMINENT CLICKS</h1>
              <p style="margin:4px 0 0 0;font-size:12px;color:#D1DCE5;">Automated Business Operations Suite</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;">Hello <strong>${safeCustomer}</strong>,</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#475569;">
                ${safeJobTitle ? `An invoice has been generated for your job <strong>${safeJobTitle}</strong>.` : "Please find the details for your new invoice below."}
              </p>

              <!-- Invoice Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F5F9;border-radius:8px;padding:20px;margin-bottom:24px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-size:12px;text-transform:uppercase;color:#64748B;font-weight:600;padding-bottom:6px;">Invoice Number</td>
                        <td align="right" style="font-size:12px;text-transform:uppercase;color:#64748B;font-weight:600;padding-bottom:6px;">Due Date</td>
                      </tr>
                      <tr>
                        <td style="font-size:16px;font-weight:700;color:#192639;">#${safeNumber}</td>
                        <td align="right" style="font-size:14px;font-weight:600;color:#192639;">${formattedDueDate}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top:16px;border-top:1px solid #CBD5E1;margin-top:12px;">
                          <div style="font-size:12px;text-transform:uppercase;color:#64748B;font-weight:600;margin-bottom:4px;">Total Amount Due</div>
                          <div style="font-size:28px;font-weight:800;color:#267A62;">${formattedBalance}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${safeNotes ? `
              <div style="margin-bottom:20px;padding:14px;background-color:#F8FAFC;border-left:4px solid #E4B94F;border-radius:4px;">
                <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:4px;">Notes & Scope</div>
                <div style="font-size:13px;line-height:20px;color:#334155;">${safeNotes}</div>
              </div>` : ""}

              ${safeBankDetails ? `
              <div style="margin-bottom:24px;padding:14px;background-color:#F8FAFC;border-left:4px solid #192639;border-radius:4px;">
                <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:4px;">Payment Instructions</div>
                <div style="font-size:13px;line-height:20px;color:#334155;">${safeBankDetails}</div>
              </div>` : ""}

              <p style="margin:24px 0 0 0;font-size:14px;line-height:22px;color:#475569;">
                Kindly arrange payment on or before <strong>${formattedDueDate}</strong>. If you have already made payment, please disregard this notice.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center;">
              Sent via Eminent Clicks PayChaser &bull; ${escapeHtml(DEFAULT_SENDER_EMAIL)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `EMINENT CLICKS — INVOICE #${params.invoiceNumber}

Hello ${params.customerName || "Valued Client"},

An invoice has been generated for you${params.jobTitle ? ` regarding ${params.jobTitle}` : ""}.

Invoice Details:
- Invoice Number: #${params.invoiceNumber}
- Total Amount Due: ${formattedBalance}
- Due Date: ${formattedDueDate}

${params.notes ? `Notes:\n${params.notes}\n\n` : ""}${params.customBankDetails ? `Payment Instructions:\n${params.customBankDetails}\n\n` : ""}Kindly arrange payment on or before ${formattedDueDate}.

Thank you,
Eminent Clicks Operations`;

  return { subject, html, text };
}

export function generateReminderEmail(params: ReminderEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeCustomer = escapeHtml(params.customerName || "Valued Client");
  const safeNumber = escapeHtml(params.invoiceNumber);
  const formattedBalance = formatNaira(params.balanceKobo);
  const formattedDueDate = formatDate(params.dueDate);
  const safeCustomNote = params.customNote ? escapeHtml(params.customNote).replace(/\n/g, "<br/>") : "";

  let badgeText = "Upcoming Due Date";
  let badgeColor = "#267A62";
  let headline = `This is a friendly reminder that invoice #${safeNumber} is due on <strong>${formattedDueDate}</strong>.`;
  let subject = `Reminder: Invoice #${params.invoiceNumber} is due on ${formattedDueDate}`;

  if (params.stage === "due_date") {
    badgeText = "Due Today";
    badgeColor = "#E4B94F";
    headline = `This is a reminder that invoice #${safeNumber} is due today (<strong>${formattedDueDate}</strong>).`;
    subject = `Payment Due Today: Invoice #${params.invoiceNumber}`;
  } else if (params.stage.startsWith("overdue")) {
    const days = params.stage.replace("overdue_", "");
    badgeText = `${days} Days Overdue`;
    badgeColor = "#DC2626";
    headline = `Our records indicate that invoice #${safeNumber} was due on ${formattedDueDate} and is now <strong>${days} days overdue</strong>.`;
    subject = `Overdue Notice (${days} days): Invoice #${params.invoiceNumber}`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color:#192639;padding:24px 32px;text-align:left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin:0;font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">EMINENT CLICKS</h1>
                    <p style="margin:2px 0 0 0;font-size:11px;color:#D1DCE5;">PayChaser Automated Reminder</p>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;border-radius:12px;background-color:${badgeColor};color:#FFFFFF;font-size:11px;font-weight:600;text-transform:uppercase;">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;">Hello <strong>${safeCustomer}</strong>,</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#475569;">
                ${headline}
              </p>

              <!-- Outstanding Balance Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F5F9;border-radius:8px;padding:20px;margin-bottom:24px;">
                <tr>
                  <td>
                    <div style="font-size:12px;text-transform:uppercase;color:#64748B;font-weight:600;margin-bottom:4px;">Outstanding Balance</div>
                    <div style="font-size:28px;font-weight:800;color:#192639;">${formattedBalance}</div>
                    <div style="font-size:12px;color:#64748B;margin-top:6px;">Invoice #${safeNumber} &bull; Due ${formattedDueDate}</div>
                  </td>
                </tr>
              </table>

              ${safeCustomNote ? `
              <div style="margin-bottom:24px;padding:14px;background-color:#F8FAFC;border-left:4px solid #192639;border-radius:4px;">
                <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;margin-bottom:4px;">Payment Instructions</div>
                <div style="font-size:13px;line-height:20px;color:#334155;">${safeCustomNote}</div>
              </div>` : ""}

              <p style="margin:24px 0 0 0;font-size:14px;line-height:22px;color:#475569;">
                Please settle this payment at your earliest convenience. If you have recently sent payment, kindly notify us so we can update your balance.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center;">
              Sent via Eminent Clicks PayChaser &bull; ${escapeHtml(DEFAULT_SENDER_EMAIL)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `EMINENT CLICKS — PAYMENT REMINDER

Hello ${params.customerName || "Valued Client"},

${headline.replace(/<[^>]+>/g, "")}

Outstanding Details:
- Invoice: #${params.invoiceNumber}
- Outstanding Balance: ${formattedBalance}
- Due Date: ${formattedDueDate}
- Status: ${badgeText}

${params.customNote ? `Payment Instructions:\n${params.customNote}\n\n` : ""}Kindly arrange payment at your earliest convenience.

Thank you,
Eminent Clicks Operations`;

  return { subject, html, text };
}
