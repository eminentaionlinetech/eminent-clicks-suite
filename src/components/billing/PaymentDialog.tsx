import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Upload, X, CheckCircle2, ImageIcon, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/common/Field";
import { PaymentStatusBadge } from "@/components/billing/StatusBadge";
import { BANK_DETAILS, TOOL_MAP, type ToolId } from "@/lib/tools";
import { formatBytes, formatDateTime, formatNaira, friendlyError, isEmail, isPhone } from "@/lib/format";
import { compressImage, uploadWithProgress, validateImageFile } from "@/lib/receipt";
import { useCurrentUser, useProfile, useToolPrices, useToolStatuses, type Payment } from "@/hooks/use-account";

type Phase = { kind: "form" } | { kind: "uploading"; pct: number } | { kind: "processing" } | { kind: "done"; payment: Payment };

export function PaymentDialog({ toolId, open, onOpenChange }: { toolId: ToolId; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tool = TOOL_MAP[toolId];
  const user = useCurrentUser();
  const profile = useProfile();
  const prices = useToolPrices();
  const { statusFor } = useToolStatuses();
  const qc = useQueryClient();
  const current = statusFor(toolId);
  const price = prices.data?.find((p) => p.id === toolId);

  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [resubmitting, setResubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setEmail(user.email ?? "");
      setWhatsapp(profile.data?.whatsapp ?? "");
      setPhase({ kind: "form" });
      setResubmitting(false);
      setSubmitError("");
      setErrors({});
      clearFile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !whatsapp && profile.data?.whatsapp) setWhatsapp(profile.data.whatsapp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  function clearFile() {
    setFile(null);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onPick(f: File | undefined) {
    if (!f) return;
    const err = await validateImageFile(f);
    if (err) {
      setErrors((e) => ({ ...e, file: err }));
      clearFile();
      return;
    }
    setErrors((e) => ({ ...e, file: "" }));
    clearFile();
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  const busy = phase.kind === "uploading" || phase.kind === "processing";

  async function submit() {
    const errs: Record<string, string> = {};
    if (!isEmail(email)) errs.email = "Enter a valid email address.";
    if (!isPhone(whatsapp)) errs.whatsapp = "Enter a valid WhatsApp number (at least 10 digits).";
    if (!file) errs.file = "Please upload your payment receipt.";
    setErrors(errs);
    setSubmitError("");
    if (Object.values(errs).some(Boolean) || !file) return;

    try {
      setPhase({ kind: "uploading", pct: 0 });
      const blob = await compressImage(file);
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/${crypto.randomUUID()}/receipt.${ext}`;
      await uploadWithProgress("receipts", path, blob, (pct) => setPhase({ kind: "uploading", pct }));
      setPhase({ kind: "processing" });
      const { data, error } = await supabase.rpc("submit_payment", {
        _tool_id: toolId,
        _email: email.trim(),
        _whatsapp: whatsapp.trim(),
        _receipt_path: path,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["payments", user.id] });
      qc.invalidateQueries({ queryKey: ["notifications", user.id] });
      setPhase({ kind: "done", payment: data as Payment });
      toast.success("Receipt submitted — awaiting verification.");
    } catch (e) {
      setPhase({ kind: "form" });
      setSubmitError(friendlyError(e, "Unable to upload your receipt. Please try again."));
    }
  }

  const showExisting = !resubmitting && phase.kind === "form" && (current.status === "pending" || current.status === "rejected" || current.status === "unlocked");

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{phase.kind === "done" ? "Receipt uploaded successfully" : `Subscribe to ${tool.name}`}</DialogTitle>
          <DialogDescription>
            {phase.kind === "done"
              ? "Your payment is awaiting admin verification."
              : price
                ? `You're subscribing to ${tool.name} for ${formatNaira(price.price_kobo)}.`
                : "Loading price..."}
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "done" ? (
          <SubmissionSummary payment={phase.payment} onClose={() => onOpenChange(false)} />
        ) : showExisting && current.status === "unlocked" ? (
          <Alert><AlertDescription>Your {tool.name} access is already active.</AlertDescription></Alert>
        ) : showExisting && current.payment && current.status === "pending" ? (
          <div className="space-y-4">
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>An administrator is reviewing your payment. You'll see the update here as soon as it's reviewed.</AlertDescription>
            </Alert>
            <SubmissionSummary payment={current.payment} onClose={() => onOpenChange(false)} />
          </div>
        ) : showExisting && current.payment && current.status === "rejected" ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Your payment submission was not approved.</strong>
                {current.payment.rejection_reason && <span className="mt-1 block">Reason: {current.payment.rejection_reason}</span>}
              </AlertDescription>
            </Alert>
            <SubmissionSummary payment={current.payment} />
            <Button className="w-full" onClick={() => setResubmitting(true)}>Resubmit payment</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border bg-secondary/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground">Bank transfer details</p>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Bank name" value={BANK_DETAILS.bankName} />
                <Row label="Account name" value={BANK_DETAILS.accountName} />
                <Row label="Account number" value={BANK_DETAILS.accountNumber} copy />
                <Row label="Amount" value={price ? formatNaira(price.price_kobo) : "—"} strong />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Transfer the displayed amount and upload your payment receipt. Your tool will be activated after payment verification.
              </p>
            </div>

            {submitError && (
              <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>
            )}

            <Field id="pay-email" label="Email" error={errors.email} required>
              <Input id="pay-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} className="h-11" />
            </Field>
            <Field id="pay-wa" label="WhatsApp number" error={errors.whatsapp} required>
              <Input id="pay-wa" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={busy} className="h-11" />
            </Field>

            <Field id="pay-file" label="Payment receipt" error={errors.file} hint="JPG or PNG, up to 10 MB." required>
              <input ref={inputRef} id="pay-file" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} disabled={busy} />
              {file && preview ? (
                <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <img src={preview} alt="Selected receipt preview" className="h-16 w-16 rounded-lg border object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>Change</Button>
                    <Button type="button" size="icon" variant="ghost" onClick={clearFile} disabled={busy} aria-label="Remove receipt"><X /></Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ImageIcon className="h-6 w-6" />
                  <span className="font-medium text-foreground">Tap to choose your receipt</span>
                  <span className="text-xs">JPG, JPEG or PNG</span>
                </button>
              )}
            </Field>

            {phase.kind === "uploading" && (
              <div className="space-y-1.5" aria-live="polite">
                <p className="text-sm font-medium">Uploading receipt... {phase.pct}%</p>
                <Progress value={phase.pct} />
              </div>
            )}
            {phase.kind === "processing" && (
              <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" /> Processing submission...</p>
            )}

            <Button className="h-11 w-full" onClick={submit} disabled={busy || !price}>
              {busy ? <><Loader2 className="animate-spin" /> Submitting...</> : <><Upload /> Submit receipt</>}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, copy, strong }: { label: string; value: string; copy?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-display text-base font-semibold" : "font-medium"}>
        {value}
        {copy && (
          <button
            type="button"
            className="ml-2 inline-flex align-middle text-primary"
            aria-label={`Copy ${label}`}
            onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Account number copied."), () => toast.error("Couldn't copy. Please copy it manually."))}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}

export function SubmissionSummary({ payment, onClose }: { payment: Payment; onClose?: () => void }) {
  const tool = TOOL_MAP[payment.tool_id as ToolId];
  return (
    <div className="space-y-4">
      {payment.status === "pending" && onClose && (
        <div className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Your receipt has been submitted and is awaiting verification.</div>
      )}
      <dl className="divide-y rounded-xl border text-sm">
        <div className="flex justify-between p-3"><dt className="text-muted-foreground">Tool</dt><dd className="font-medium">{tool?.name ?? payment.tool_id}</dd></div>
        <div className="flex justify-between p-3"><dt className="text-muted-foreground">Amount</dt><dd className="font-medium">{formatNaira(payment.amount_kobo)}</dd></div>
        <div className="flex justify-between p-3"><dt className="text-muted-foreground">Tracking code</dt><dd className="font-mono font-semibold">{payment.tracking_code}</dd></div>
        <div className="flex justify-between p-3"><dt className="text-muted-foreground">Submitted</dt><dd>{formatDateTime(payment.submitted_at)}</dd></div>
        <div className="flex items-center justify-between p-3"><dt className="text-muted-foreground">Status</dt><dd><PaymentStatusBadge status={payment.status} /></dd></div>
      </dl>
      {onClose && <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>}
    </div>
  );
}
