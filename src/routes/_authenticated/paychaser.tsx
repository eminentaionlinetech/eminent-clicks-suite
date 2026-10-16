import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CheckCircle2, CreditCard, Mail, MessageCircle, Pencil, Plus, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ToolGate } from "@/components/billing/ToolGate";
import { EmptyState, ListSkeleton, LoadError, NoMatches, PageHeader, Pill, StatCard } from "@/components/common/ui-bits";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete, FormDialog, NativeSelect, SearchInput, label } from "@/components/tools/kit";
import { formatDate, formatDateTime, formatNaira, friendlyError, parseNairaToKobo, todayISO } from "@/lib/format";
import { invoiceIsOverdue } from "@/lib/summaries";

type Invoice = Tables<"pc_invoices">;

export const Route = createFileRoute("/_authenticated/paychaser")({
  head: () => ({
    meta: [
      { title: "PayChaser — Eminent Clicks" },
      { name: "description", content: "Track invoices, customer payments and overdue reminders in Naira." },
      { property: "og:title", content: "PayChaser — Eminent Clicks" },
      { property: "og:description", content: "Track invoices, customer payments and overdue reminders in Naira." },
    ],
  }),
  component: () => (
    <ToolGate toolId="paychaser">
      <PayChaser />
    </ToolGate>
  ),
});

const STAGES = ["before_due", "due_date", "overdue_3", "overdue_7", "overdue_14"];
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

function PayChaser() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["paychaser"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pc_invoices").select("*").order("due_date");
      if (error) throw error;
      return data;
    },
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Invoice | "new" | null>(null);
  const [paymentFor, setPaymentFor] = useState<Invoice | null>(null);
  const [reminderFor, setReminderFor] = useState<Invoice | null>(null);

  const list = q.data ?? [];
  const open = list.filter((i) => i.status !== "paid" && i.status !== "draft");
  const overdue = open.filter(invoiceIsOverdue);

  const totalOutstanding = open.reduce((a, i) => a + (i.balance_kobo ?? i.amount_kobo), 0);
  const totalOverdue = overdue.reduce((a, i) => a + (i.balance_kobo ?? i.amount_kobo), 0);
  const totalPaid = list.reduce((a, i) => {
    const bal = i.balance_kobo ?? (i.status === "paid" ? 0 : i.amount_kobo);
    return a + Math.max(0, i.amount_kobo - bal);
  }, 0);

  const filtered = useMemo(
    () =>
      list.filter((i) => {
        const isPartiallyPaid = (i.balance_kobo ?? i.amount_kobo) < i.amount_kobo && (i.balance_kobo ?? i.amount_kobo) > 0;
        const st = invoiceIsOverdue(i) ? "overdue" : isPartiallyPaid ? "partially_paid" : i.status;
        return (filter === "all" || st === filter) && `${i.customer} ${i.invoice_number}`.toLowerCase().includes(search.toLowerCase());
      }),
    [list, search, filter],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["paychaser"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };

  async function markPaid(i: Invoice) {
    const remainingKobo = i.balance_kobo ?? i.amount_kobo;
    if (remainingKobo > 0) {
      // Record payment for the full remaining balance
      const { error: payErr } = await supabase.from("pc_payments").insert({
        invoice_id: i.id,
        amount_kobo: remainingKobo,
        payment_method: "bank_transfer",
        notes: "Marked as fully paid",
        payment_date: todayISO(),
      });
      if (payErr) {
        // Fallback direct update if payments table not yet active
        const { error: upErr } = await supabase.from("pc_invoices").update({ status: "paid", balance_kobo: 0, paid_at: new Date().toISOString() }).eq("id", i.id);
        if (upErr) return void toast.error(friendlyError(upErr, "Couldn't update this invoice."));
      }
    } else {
      const { error } = await supabase.from("pc_invoices").update({ status: "paid", balance_kobo: 0, paid_at: new Date().toISOString() }).eq("id", i.id);
      if (error) return void toast.error(friendlyError(error, "Couldn't update this invoice."));
    }
    toast.success(`Invoice ${i.invoice_number} marked as paid.`);
    refresh();
  }

  function reminderMessage(i: Invoice) {
    const od = invoiceIsOverdue(i);
    const balance = i.balance_kobo ?? i.amount_kobo;
    return `Hello ${i.customer}, this is a friendly reminder from Eminent Clicks about invoice #${i.invoice_number} for ${formatNaira(balance)}${balance < i.amount_kobo ? ` (remaining balance of ${formatNaira(i.amount_kobo)})` : ""}, which was due on ${formatDate(i.due_date)}${od ? " and is now overdue" : ""}. Kindly make payment at your earliest convenience. Thank you!`;
  }

  function whatsappReminder(i: Invoice) {
    const phone = i.customer_phone ? i.customer_phone.replace(/\D/g, "") : "";
    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(reminderMessage(i))}` : `https://wa.me/?text=${encodeURIComponent(reminderMessage(i))}`;
    window.open(url, "_blank", "noopener");
  }

  function emailReminder(i: Invoice) {
    const subject = `Payment reminder — invoice #${i.invoice_number}`;
    const mailto = `mailto:${i.customer_email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reminderMessage(i))}`;
    window.location.href = mailto;
    toast.success(i.customer_email ? "Opening your email app with the reminder." : "Opening your email app — choose the customer as recipient.");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("pc_invoices").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this invoice."));
    toast.success("Invoice deleted.");
    refresh();
  }

  return (
    <>
      <PageHeader
        eyebrow="PayChaser"
        title="Invoices"
        description="Track customer invoices, payments and balances in Nigerian Naira (₦)."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New invoice
          </Button>
        }
      />
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError message="Unable to load your invoices." onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Outstanding" value={formatNaira(totalOutstanding)} icon={Wallet} />
            <StatCard
              label="Overdue"
              value={formatNaira(totalOverdue)}
              icon={AlertTriangle}
              tone={overdue.length ? "danger" : "default"}
              hint={`${overdue.length} invoice(s)`}
            />
            <StatCard label="Paid collected" value={formatNaira(totalPaid)} icon={CheckCircle2} tone="success" />
            <StatCard label="Total Invoices" value={list.length} icon={Receipt} />
          </div>
          {list.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet."
              description="Create an invoice or convert a job from JobFlow to start tracking customer payments."
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus /> New invoice
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <SearchInput value={search} onChange={setSearch} placeholder="Search customer or invoice number" />
                <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-44" aria-label="Filter">
                  <option value="all">All</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partially_paid">Partially paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </NativeSelect>
              </div>
              {filtered.length === 0 ? (
                <NoMatches onClear={() => { setSearch(""); setFilter("all"); }} />
              ) : (
                <ul className="space-y-3">
                  {filtered.map((i) => {
                    const od = invoiceIsOverdue(i);
                    const bal = i.balance_kobo ?? i.amount_kobo;
                    const isPartial = bal < i.amount_kobo && bal > 0;
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {i.customer}{" "}
                            <span className="font-mono text-xs font-normal text-muted-foreground">#{i.invoice_number}</span>
                          </p>
                          <div className="text-sm text-muted-foreground">
                            <span>Total: <strong className="font-medium text-foreground">{formatNaira(i.amount_kobo)}</strong></span>
                            {isPartial && (
                              <span className="ml-2 text-warning font-medium">
                                · Bal: {formatNaira(bal)} (Paid: {formatNaira(i.amount_kobo - bal)})
                              </span>
                            )}
                            <span className="ml-2">· Due {formatDate(i.due_date)}</span>
                            {i.paid_at && <span className="ml-2 text-success">· Paid {formatDate(i.paid_at)}</span>}
                          </div>
                        </div>
                        <Pill tone={i.status === "paid" ? "success" : od ? "danger" : isPartial ? "warning" : i.status === "draft" ? "muted" : "warning"}>
                          {od ? "Overdue" : isPartial ? "Partially paid" : label(i.status)}
                        </Pill>
                        {i.status !== "paid" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setPaymentFor(i)} aria-label={`Record payment for ${i.customer}`}>
                              <CreditCard className="h-4 w-4 mr-1" /> Record payment
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => whatsappReminder(i)} aria-label={`Send WhatsApp reminder to ${i.customer}`}>
                              <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => emailReminder(i)} aria-label={`Send email reminder to ${i.customer}`}>
                              <Mail className="h-4 w-4 mr-1" /> Email
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => markPaid(i)}>
                              Mark paid
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setReminderFor(i)}>
                          <BellRing className="h-4 w-4 mr-1" /> Reminders
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(i)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDelete what="invoice" onConfirm={() => remove(i.id)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {editing && <InvoiceForm inv={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {paymentFor && <RecordPaymentDialog inv={paymentFor} onClose={() => setPaymentFor(null)} onSaved={refresh} />}
      {reminderFor && <Reminders inv={reminderFor} onClose={() => setReminderFor(null)} />}
    </>
  );
}

function InvoiceForm({ inv, onClose, onSaved }: { inv: Invoice | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    customer: inv?.customer ?? "",
    customer_email: inv?.customer_email ?? "",
    customer_phone: inv?.customer_phone ?? "",
    invoice_number: inv?.invoice_number ?? "",
    amount: inv ? String(Math.round(inv.amount_kobo / 100)) : "",
    issue_date: inv?.issue_date ?? todayISO(),
    due_date: inv?.due_date ?? "",
    status: inv?.status ?? "sent",
    description: inv?.description ?? "",
    notes: inv?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const errs: Record<string, string> = {};
    if (!f.customer.trim()) errs.customer = "Customer is required.";
    if (!f.invoice_number.trim()) errs.invoice_number = "Invoice number is required.";
    const amount = parseNairaToKobo(f.amount);
    if (!amount) errs.amount = "Enter an amount in Naira greater than zero.";
    if (!f.issue_date) errs.issue_date = "Issue date is required.";
    if (!f.due_date) errs.due_date = "Due date is required.";
    else if (f.due_date < f.issue_date) errs.due_date = "Due date can't be before the issue date.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);

    const row = {
      customer: f.customer.trim(),
      customer_email: f.customer_email.trim() || null,
      customer_phone: f.customer_phone.trim() || null,
      invoice_number: f.invoice_number.trim(),
      amount_kobo: amount!,
      balance_kobo: inv ? (inv.balance_kobo ?? amount!) : amount!,
      issue_date: f.issue_date,
      due_date: f.due_date,
      status: f.status,
      description: f.description.trim(),
      notes: f.notes.trim(),
      paid_at: f.status === "paid" ? (inv?.paid_at ?? new Date().toISOString()) : null,
    };
    const { error } = inv ? await supabase.from("pc_invoices").update(row).eq("id", inv.id) : await supabase.from("pc_invoices").insert(row);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't save this invoice."));
    toast.success(inv ? "Invoice updated." : "Invoice added.");
    onSaved();
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={inv ? "Edit invoice" : "New invoice"} onSubmit={save} submitting={busy}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cust" label="Customer" required error={errors.customer}>
          <Input id="cust" value={f.customer} onChange={set("customer")} placeholder="e.g. Adebayo Ltd" />
        </Field>
        <Field id="custemail" label="Customer email" hint="Used for email reminders.">
          <Input id="custemail" type="email" value={f.customer_email} onChange={set("customer_email")} placeholder="customer@example.com" />
        </Field>
        <Field id="custphone" label="Customer WhatsApp/Phone" hint="Used for WhatsApp reminders.">
          <Input id="custphone" type="tel" value={f.customer_phone} onChange={set("customer_phone")} placeholder="e.g. 08012345678" />
        </Field>
        <Field id="num" label="Invoice number" required error={errors.invoice_number}>
          <Input id="num" value={f.invoice_number} onChange={set("invoice_number")} placeholder="e.g. INV-001" />
        </Field>
        <Field id="amt" label="Amount (₦ Naira)" required error={errors.amount} hint="Enter whole amount in Naira">
          <Input id="amt" inputMode="numeric" value={f.amount} onChange={set("amount")} placeholder="e.g. 50000" />
        </Field>
        <Field id="st" label="Status">
          <NativeSelect id="st" value={f.status} onChange={set("status")}>
            {["draft", "sent", "unpaid", "paid"].map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="iss" label="Issue date" required error={errors.issue_date}>
          <Input id="iss" type="date" value={f.issue_date} onChange={set("issue_date")} />
        </Field>
        <Field id="due" label="Due date" required error={errors.due_date}>
          <Input id="due" type="date" value={f.due_date} onChange={set("due_date")} />
        </Field>
      </div>
      <Field id="desc" label="Description">
        <Input id="desc" value={f.description} onChange={set("description")} placeholder="e.g. Website design services" />
      </Field>
      <Field id="notes" label="Notes">
        <Textarea id="notes" value={f.notes} onChange={set("notes")} placeholder="Payment terms, bank details, etc." />
      </Field>
    </FormDialog>
  );
}

function RecordPaymentDialog({ inv, onClose, onSaved }: { inv: Invoice; onClose: () => void; onSaved: () => void }) {
  const remainingKobo = inv.balance_kobo ?? inv.amount_kobo;
  const [amountNaira, setAmountNaira] = useState(String(Math.round(remainingKobo / 100)));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const kobo = parseNairaToKobo(amountNaira);
    if (!kobo || kobo <= 0) {
      setError("Please enter a valid amount in Naira.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: insertErr } = await supabase.from("pc_payments").insert({
      invoice_id: inv.id,
      amount_kobo: kobo,
      payment_method: method,
      reference: reference.trim(),
      notes: notes.trim(),
      payment_date: date,
    });
    setBusy(false);
    if (insertErr) {
      toast.error(friendlyError(insertErr, "Failed to record payment."));
      return;
    }
    toast.success(`Payment of ${formatNaira(kobo)} recorded successfully.`);
    onSaved();
    onClose();
  }

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Record Payment · ${inv.customer}`}
      description={`Record customer payment against Invoice #${inv.invoice_number}. Total: ${formatNaira(inv.amount_kobo)}, Remaining: ${formatNaira(remainingKobo)}.`}
      onSubmit={save}
      submitting={busy}
      submitLabel="Save Payment"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payamt" label="Amount received (₦ Naira)" required error={error ?? undefined}>
          <Input id="payamt" inputMode="numeric" value={amountNaira} onChange={(e) => setAmountNaira(e.target.value)} placeholder="e.g. 25000" />
        </Field>
        <Field id="paymethod" label="Payment Method">
          <NativeSelect id="paymethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="paydate" label="Payment Date">
          <Input id="paydate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="payref" label="Reference / Transaction ID" hint="Optional">
          <Input id="payref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRF-9283749" />
        </Field>
      </div>
      <Field id="paynotes" label="Notes" hint="Optional">
        <Textarea id="paynotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. First installment received via GTBank" />
      </Field>
    </FormDialog>
  );
}

function Reminders({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["paychaser", "reminders", inv.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pc_reminders").select("*").eq("invoice_id", inv.id).order("recorded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [stage, setStage] = useState("due_date");
  const [channel, setChannel] = useState("whatsapp");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("pc_reminders").insert({ invoice_id: inv.id, stage, channel, note: note.trim() });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't record this reminder."));
    toast.success("Reminder recorded.");
    setNote("");
    qc.invalidateQueries({ queryKey: ["paychaser", "reminders", inv.id] });
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Reminders · ${inv.customer}`} description="Log each reminder sent so you know where every invoice stands." onSubmit={save} submitting={busy} submitLabel="Record reminder">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="stage" label="Stage">
          <NativeSelect id="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((x) => (
              <option key={x} value={x}>
                {label(x).replace("Overdue ", "Overdue +").concat(x.startsWith("overdue") ? " days" : "")}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="ch" label="Sent via">
          <NativeSelect id="ch" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {["whatsapp", "email", "sms", "call", "in_person"].map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id="rnote" label="Note">
        <Textarea id="rnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called customer, promised to pay by Friday." />
      </Field>
      <div>
        <h3 className="mb-2 text-sm font-semibold">History</h3>
        {q.isLoading ? (
          <ListSkeleton rows={2} />
        ) : q.isError ? (
          <LoadError message="Unable to load reminders." />
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No reminders recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {q.data.map((r) => (
              <li key={r.id} className="p-3">
                <p className="font-medium">
                  {label(r.stage)} · {label(r.channel)}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(r.recorded_at)}</p>
                {r.note && <p className="mt-1">{r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormDialog>
  );
}
