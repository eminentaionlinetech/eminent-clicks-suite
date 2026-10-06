import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CheckCircle2, Mail, MessageCircle, Pencil, Plus, Receipt, Wallet } from "lucide-react";
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
      { name: "description", content: "Track invoices, overdue payments and reminders." },
      { property: "og:title", content: "PayChaser — Eminent Clicks" },
      { property: "og:description", content: "Track invoices, overdue payments and reminders." },
    ],
  }),
  component: () => (
    <ToolGate toolId="paychaser">
      <PayChaser />
    </ToolGate>
  ),
});

const STAGES = ["before_due", "due_date", "overdue_3", "overdue_7", "overdue_14"];

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
  const [reminderFor, setReminderFor] = useState<Invoice | null>(null);

  const list = q.data ?? [];
  const open = list.filter((i) => i.status !== "paid" && i.status !== "draft");
  const overdue = open.filter(invoiceIsOverdue);
  const filtered = useMemo(
    () =>
      list.filter((i) => {
        const st = invoiceIsOverdue(i) ? "overdue" : i.status;
        return (filter === "all" || st === filter) && `${i.customer} ${i.invoice_number}`.toLowerCase().includes(search.toLowerCase());
      }),
    [list, search, filter],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["paychaser"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };

  async function markPaid(i: Invoice) {
    const { error } = await supabase.from("pc_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", i.id);
    if (error) return void toast.error(friendlyError(error, "Couldn't update this invoice."));
    toast.success(`Invoice ${i.invoice_number} marked as paid.`);
    refresh();
  }
  function whatsappReminder(i: Invoice) {
    const od = invoiceIsOverdue(i);
    const msg = `Hello ${i.customer}, this is a friendly reminder about invoice #${i.invoice_number} for ${formatNaira(i.amount_kobo)}, which was due on ${formatDate(i.due_date)}${od ? " and is now overdue" : ""}. Kindly make payment at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }
  async function remove(id: string) {
    const { error } = await supabase.from("pc_invoices").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this invoice."));
    toast.success("Invoice deleted.");
    refresh();
  }

  return (
    <>
      <PageHeader eyebrow="PayChaser" title="Invoices" description="What you're owed, and what's overdue." actions={<Button onClick={() => setEditing("new")}><Plus /> New invoice</Button>} />
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError message="Unable to load your invoices." onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Outstanding" value={formatNaira(open.reduce((a, i) => a + i.amount_kobo, 0))} icon={Wallet} />
            <StatCard label="Overdue" value={formatNaira(overdue.reduce((a, i) => a + i.amount_kobo, 0))} icon={AlertTriangle} tone={overdue.length ? "danger" : "default"} hint={`${overdue.length} invoice(s)`} />
            <StatCard label="Paid" value={formatNaira(list.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount_kobo, 0))} icon={CheckCircle2} tone="success" />
            <StatCard label="Invoices" value={list.length} icon={Receipt} />
          </div>
          {list.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices yet." description="Add an invoice to start tracking what customers owe you." action={<Button onClick={() => setEditing("new")}><Plus /> New invoice</Button>} />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <SearchInput value={search} onChange={setSearch} placeholder="Search customer or invoice number" />
                <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-44" aria-label="Filter">
                  <option value="all">All</option>
                  {["draft", "sent", "unpaid", "overdue", "paid"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
                </NativeSelect>
              </div>
              {filtered.length === 0 ? (
                <NoMatches onClear={() => { setSearch(""); setFilter("all"); }} />
              ) : (
                <ul className="space-y-3">
                  {filtered.map((i) => {
                    const od = invoiceIsOverdue(i);
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{i.customer} <span className="font-mono text-xs font-normal text-muted-foreground">#{i.invoice_number}</span></p>
                          <p className="text-sm text-muted-foreground">{formatNaira(i.amount_kobo)} · Due {formatDate(i.due_date)}{i.paid_at && ` · Paid ${formatDate(i.paid_at)}`}</p>
                        </div>
                        <Pill tone={i.status === "paid" ? "success" : od ? "danger" : i.status === "draft" ? "muted" : "warning"}>{od ? "Overdue" : label(i.status)}</Pill>
                        {i.status !== "paid" && (
                          <Button size="sm" variant="outline" onClick={() => whatsappReminder(i)} aria-label={`Send WhatsApp reminder to ${i.customer}`}>
                            <MessageCircle /> WhatsApp
                          </Button>
                        )}
                        {i.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid(i)}>Mark paid</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setReminderFor(i)}><BellRing /> Reminders</Button>
                        <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(i)}><Pencil /></Button>
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
      {reminderFor && <Reminders inv={reminderFor} onClose={() => setReminderFor(null)} />}
    </>
  );
}

function InvoiceForm({ inv, onClose, onSaved }: { inv: Invoice | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    customer: inv?.customer ?? "",
    invoice_number: inv?.invoice_number ?? "",
    amount: inv ? String(inv.amount_kobo / 100) : "",
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
    if (!amount) errs.amount = "Enter an amount greater than zero.";
    if (!f.issue_date) errs.issue_date = "Issue date is required.";
    if (!f.due_date) errs.due_date = "Due date is required.";
    else if (f.due_date < f.issue_date) errs.due_date = "Due date can't be before the issue date.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const row = {
      customer: f.customer.trim(), invoice_number: f.invoice_number.trim(), amount_kobo: amount!, issue_date: f.issue_date,
      due_date: f.due_date, status: f.status, description: f.description.trim(), notes: f.notes.trim(),
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
        <Field id="cust" label="Customer" required error={errors.customer}><Input id="cust" value={f.customer} onChange={set("customer")} /></Field>
        <Field id="num" label="Invoice number" required error={errors.invoice_number}><Input id="num" value={f.invoice_number} onChange={set("invoice_number")} /></Field>
        <Field id="amt" label="Amount (₦)" required error={errors.amount}><Input id="amt" inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
        <Field id="st" label="Status">
          <NativeSelect id="st" value={f.status} onChange={set("status")}>
            {["draft", "sent", "unpaid", "paid"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="iss" label="Issue date" required error={errors.issue_date}><Input id="iss" type="date" value={f.issue_date} onChange={set("issue_date")} /></Field>
        <Field id="due" label="Due date" required error={errors.due_date}><Input id="due" type="date" value={f.due_date} onChange={set("due_date")} /></Field>
      </div>
      <Field id="desc" label="Description"><Input id="desc" value={f.description} onChange={set("description")} /></Field>
      <Field id="notes" label="Notes"><Textarea id="notes" value={f.notes} onChange={set("notes")} /></Field>
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
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Reminders · ${inv.customer}`} description="Log each reminder you've sent so you know where every invoice stands." onSubmit={save} submitting={busy} submitLabel="Record reminder">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="stage" label="Stage">
          <NativeSelect id="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((x) => <option key={x} value={x}>{label(x).replace("Overdue ", "Overdue +").concat(x.startsWith("overdue") ? " days" : "")}</option>)}
          </NativeSelect>
        </Field>
        <Field id="ch" label="Sent via">
          <NativeSelect id="ch" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {["whatsapp", "email", "sms", "call", "in_person"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="rnote" label="Note"><Textarea id="rnote" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div>
        <h3 className="mb-2 text-sm font-semibold">History</h3>
        {q.isLoading ? <ListSkeleton rows={2} /> : q.isError ? <LoadError message="Unable to load reminders." /> : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No reminders recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {q.data.map((r) => (
              <li key={r.id} className="p-3">
                <p className="font-medium">{label(r.stage)} · {label(r.channel)}</p>
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
