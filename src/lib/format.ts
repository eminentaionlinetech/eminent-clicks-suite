const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export const formatNaira = (kobo: number | null | undefined) => {
  if (kobo === null || kobo === undefined || !Number.isFinite(kobo)) return "₦0";
  return naira.format(Math.round(kobo / 100));
};

/** Parse a user-typed whole naira amount into integer kobo. Returns null when invalid or decimal. */
export function parseNairaToKobo(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[,\s₦]/g, "").trim();
  if (!/^\d+(\.00)?$/.test(cleaned)) return null;
  const val = parseInt(cleaned.split(".")[0], 10);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val * 100;
}

export const formatDate = (d: string | null | undefined) =>
  d
    ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const formatDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

export const formatBytes = (b: number) =>
  b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
export const isPhone = (s: string) => s.replace(/\D/g, "").length >= 10;

const ERROR_MAP: Record<string, string> = {
  already_pending: "You already have a payment awaiting verification for this tool.",
  already_active: "This tool is already unlocked on your account.",
  receipt_missing: "We couldn't find your uploaded receipt. Please upload it again.",
  invalid_email: "Please enter a valid email address.",
  invalid_phone: "Please enter a valid WhatsApp number.",
  forbidden: "You don't have permission to do that.",
  not_pending: "This payment has already been reviewed.",
  reason_required: "Please provide a reason for rejection.",
  amount_mismatch: "The payment amount doesn't match the tool price.",
  tool_not_unlocked: "PayChaser is not unlocked on your account. Please unlock it to create invoices.",
  job_not_found: "The selected job could not be found.",
  quote_not_found: "The selected quote could not be found.",
  overpayment_rejected: "Payment amount exceeds the outstanding balance on this invoice.",
  payment_amount_must_be_positive: "Payment amount must be greater than ₦0.",
};

/** Map a backend error to a safe, user-friendly message. */
export function friendlyError(err: unknown, fallback: string) {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  for (const key of Object.keys(ERROR_MAP)) if (msg.includes(key)) return ERROR_MAP[key];
  if (msg.includes("duplicate key")) return "A record with these details already exists.";
  if (msg.includes("row-level security")) return "You don't have access to do that.";
  return fallback;
}
