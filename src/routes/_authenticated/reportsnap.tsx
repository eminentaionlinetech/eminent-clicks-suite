import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Download, Pencil, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ToolGate } from "@/components/billing/ToolGate";
import { EmptyState, ListSkeleton, LoadError, NoMatches, PageHeader, Pill, StatCard } from "@/components/common/ui-bits";
import { Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete, FormDialog, NativeSelect, SearchInput, downloadCsv } from "@/components/tools/kit";
import { formatDate, formatNaira, friendlyError, parseNairaToKobo, todayISO } from "@/lib/format";

type Tx = Tables<"rs_transactions">;

export const Route = createFileRoute("/_authenticated/reportsnap")({
  head: () => ({
    meta: [
      { title: "ReportSnap — Eminent Clicks" },
      { name: "description", content: "Sales, expenses and profit reports from your own numbers." },
      { property: "og:title", content: "ReportSnap — Eminent Clicks" },
      { property: "og:description", content: "Sales, expenses and profit reports from your own numbers." },
    ],
  }),
  component: () => (
    <ToolGate toolId="reportsnap">
      <ReportSnap />
    </ToolGate>
  ),
});

function ReportSnap() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["reportsnap"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rs_transactions").select("*").order("occurred_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Tx | "new" | null>(null);

  const all = q.data ?? [];
  const inRange = all.filter((t) => (!from || t.occurred_on >= from) && (!to || t.occurred_on <= to));
  const sales = inRange.filter((t) => t.kind === "sale").reduce((a, t) => a + t.amount_kobo, 0);
  const expenses = inRange.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amount_kobo, 0);
  const filtered = inRange.filter((t) => (kind === "all" || t.kind === kind) && `${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase()));

  const chart = useMemo(() => {
    const m = new Map<string, { month: string; Sales: number; Expenses: number; Profit: number }>();
    [...inRange].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)).forEach((t) => {
      const k = t.occurred_on.slice(0, 7);
      const row = m.get(k) ?? { month: k, Sales: 0, Expenses: 0, Profit: 0 };
      if (t.kind === "sale") row.Sales += t.amount_kobo / 100;
      else row.Expenses += t.amount_kobo / 100;
      row.Profit = row.Sales - row.Expenses;
      m.set(k, row);
    });
    return [...m.values()];
  }, [inRange]);

  async function remove(id: string) {
    const { error } = await supabase.from("rs_transactions").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this record."));
    toast.success("Record deleted.");
    qc.invalidateQueries({ queryKey: ["reportsnap"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }

  function exportCsv() {
    downloadCsv(`reportsnap-${todayISO()}.csv`, [
      ["Date", "Type", "Category", "Description", "Amount (NGN)"],
      ...filtered.map((t) => [t.occurred_on, t.kind, t.category, t.description, (t.amount_kobo / 100).toFixed(2)]),
    ]);
  }

  return (
    <>
      <PageHeader
        eyebrow="ReportSnap"
        title="Financial reports"
        description="Record sales and expenses; reports are built only from what you enter."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download /> Export CSV</Button>
            <Button onClick={() => setEditing("new")}><Plus /> Add record</Button>
          </>
        }
      />
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError message="Unable to load your records." onRetry={() => q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={BarChart3} title="No sales or expenses yet." description="Add your first sale or expense to see profit reports and charts." action={<Button onClick={() => setEditing("new")}><Plus /> Add record</Button>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field id="from" label="From"><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field id="to" label="To"><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            {(from || to) && <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>All time</Button>}
          </div>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Sales" value={formatNaira(sales)} icon={TrendingUp} tone="success" />
            <StatCard label="Expenses" value={formatNaira(expenses)} icon={TrendingDown} tone="danger" />
            <StatCard label="Profit" value={formatNaira(sales - expenses)} icon={Wallet} tone={sales - expenses >= 0 ? "success" : "danger"} />
          </div>
          {chart.length > 0 && (
            <div className="mb-6 h-72 rounded-xl border bg-card p-4 shadow-card">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatNaira(Math.round(v * 100))} />
                  <Legend />
                  <Bar dataKey="Sales" fill="var(--success)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Profit" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Search description or category" />
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} className="sm:w-40" aria-label="Type">
              <option value="all">All types</option>
              <option value="sale">Sales</option>
              <option value="expense">Expenses</option>
            </NativeSelect>
          </div>
          {filtered.length === 0 ? (
            <NoMatches onClear={() => { setSearch(""); setKind("all"); setFrom(""); setTo(""); }} />
          ) : (
            <ul className="space-y-2">
              {filtered.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-card">
                  <Pill tone={t.kind === "sale" ? "success" : "danger"}>{t.kind === "sale" ? "Sale" : "Expense"}</Pill>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.description || t.category || "—"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.occurred_on)}{t.category && ` · ${t.category}`}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatNaira(t.amount_kobo)}</span>
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(t)}><Pencil /></Button>
                  <ConfirmDelete what="record" onConfirm={() => remove(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && <TxForm tx={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TxForm({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: tx?.kind ?? "sale", amount: tx ? String(tx.amount_kobo / 100) : "", occurred_on: tx?.occurred_on ?? todayISO(), category: tx?.category ?? "", description: tx?.description ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const errs: Record<string, string> = {};
    const amount = parseNairaToKobo(f.amount);
    if (!amount) errs.amount = "Enter an amount greater than zero.";
    if (!f.occurred_on) errs.date = "Date is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const row = { kind: f.kind, amount_kobo: amount!, occurred_on: f.occurred_on, category: f.category.trim(), description: f.description.trim() };
    const { error } = tx ? await supabase.from("rs_transactions").update(row).eq("id", tx.id) : await supabase.from("rs_transactions").insert(row);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't save this record."));
    toast.success(tx ? "Record updated." : "Record added.");
    qc.invalidateQueries({ queryKey: ["reportsnap"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={tx ? "Edit record" : "Add sale or expense"} onSubmit={save} submitting={busy}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="kind" label="Type">
          <NativeSelect id="kind" value={f.kind} onChange={set("kind")}>
            <option value="sale">Sale</option>
            <option value="expense">Expense</option>
          </NativeSelect>
        </Field>
        <Field id="amt" label="Amount (₦)" required error={errors.amount}><Input id="amt" inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
        <Field id="date" label="Date" required error={errors.date}><Input id="date" type="date" value={f.occurred_on} onChange={set("occurred_on")} /></Field>
        <Field id="cat" label="Category"><Input id="cat" value={f.category} onChange={set("category")} /></Field>
      </div>
      <Field id="desc" label="Description"><Input id="desc" value={f.description} onChange={set("description")} /></Field>
    </FormDialog>
  );
}
