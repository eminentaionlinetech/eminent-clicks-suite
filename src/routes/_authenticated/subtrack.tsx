import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus, Wallet, Timer, Repeat } from "lucide-react";
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
import { formatDate, formatNaira, friendlyError, parseNairaToKobo, todayISO } from "@/lib/format";
import { MONTHLY_FACTOR } from "@/lib/summaries";

type Sub = Tables<"st_subscriptions">;

export const Route = createFileRoute("/_authenticated/subtrack")({
  head: () => ({
    meta: [
      { title: "SubTrack — Eminent Clicks" },
      { name: "description", content: "Track subscriptions, renewals and trials." },
      { property: "og:title", content: "SubTrack — Eminent Clicks" },
      { property: "og:description", content: "Track subscriptions, renewals and trials." },
    ],
  }),
  component: () => (
    <ToolGate toolId="subtrack">
      <SubTrack />
    </ToolGate>
  ),
});

const daysUntil = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(todayISO() + "T00:00:00").getTime()) / 86400000);

function SubTrack() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["subtrack"],
    queryFn: async () => {
      const { data, error } = await supabase.from("st_subscriptions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Sub | "new" | null>(null);

  const subs = q.data ?? [];
  const active = subs.filter((s) => s.status === "active");
  const monthly = active.reduce((a, s) => a + s.cost_kobo * (MONTHLY_FACTOR[s.frequency] ?? 1), 0);
  const renewals = active.filter((s) => s.renewal_date && daysUntil(s.renewal_date) >= 0 && daysUntil(s.renewal_date) <= 30).sort((a, b) => a.renewal_date!.localeCompare(b.renewal_date!));
  const trials = subs.filter((s) => s.status !== "cancelled" && s.trial_end_date && daysUntil(s.trial_end_date) >= 0 && daysUntil(s.trial_end_date) <= 14);

  const filtered = useMemo(
    () =>
      subs.filter(
        (s) => (status === "all" || s.status === status) && `${s.name} ${s.provider} ${s.category}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [subs, search, status],
  );

  async function remove(id: string) {
    const { error } = await supabase.from("st_subscriptions").delete().eq("id", id);
    if (error) return void toast.error(friendlyError(error, "Couldn't delete this subscription."));
    toast.success("Subscription deleted.");
    qc.invalidateQueries({ queryKey: ["subtrack"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  }

  return (
    <>
      <PageHeader eyebrow="SubTrack" title="Subscriptions" description="Every recurring payment in one place." actions={<Button onClick={() => setEditing("new")}><Plus /> Add subscription</Button>} />
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError message="Unable to load your subscriptions." onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active" value={active.length} icon={Repeat} />
            <StatCard label="Monthly spend" value={formatNaira(Math.round(monthly))} icon={Wallet} />
            <StatCard label="Annual spend" value={formatNaira(Math.round(monthly * 12))} icon={Wallet} />
            <StatCard label="Trials ending (14d)" value={trials.length} icon={Timer} tone={trials.length ? "warning" : "default"} />
          </div>
          {renewals.length > 0 && (
            <div className="mb-6 rounded-xl border bg-card p-4 shadow-card">
              <h2 className="mb-2 font-semibold">Renewing in the next 30 days</h2>
              <ul className="divide-y text-sm">
                {renewals.map((s) => (
                  <li key={s.id} className="flex justify-between py-2">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">{formatDate(s.renewal_date)} · {formatNaira(s.cost_kobo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {subs.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No subscriptions yet." description="Add your first subscription to see your monthly spend and upcoming renewals." action={<Button onClick={() => setEditing("new")}><Plus /> Add subscription</Button>} />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <SearchInput value={search} onChange={setSearch} placeholder="Search name, provider, category" />
                <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44" aria-label="Filter by status">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                </NativeSelect>
              </div>
              {filtered.length === 0 ? (
                <NoMatches onClear={() => { setSearch(""); setStatus("all"); }} />
              ) : (
                <ul className="space-y-3">
                  {filtered.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{s.name} <span className="font-normal text-muted-foreground">{s.provider && `· ${s.provider}`}</span></p>
                        <p className="text-sm text-muted-foreground">
                          {formatNaira(s.cost_kobo)} / {s.frequency.replace("ly", "")} · Renews {formatDate(s.renewal_date)}
                          {s.trial_end_date && ` · Trial ends ${formatDate(s.trial_end_date)}`}
                        </p>
                      </div>
                      <Pill tone={s.status === "active" ? "success" : s.status === "paused" ? "warning" : "muted"}>{label(s.status)}</Pill>
                      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(s)}><Pencil /></Button>
                      <ConfirmDelete what="subscription" onConfirm={() => remove(s.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {editing && <SubForm sub={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SubForm({ sub, onClose }: { sub: Sub | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: sub?.name ?? "",
    provider: sub?.provider ?? "",
    cost: sub ? String(sub.cost_kobo / 100) : "",
    frequency: sub?.frequency ?? "monthly",
    renewal_date: sub?.renewal_date ?? "",
    trial_end_date: sub?.trial_end_date ?? "",
    category: sub?.category ?? "",
    status: sub?.status ?? "active",
    notes: sub?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Name is required.";
    const cost = parseNairaToKobo(f.cost);
    if (cost === null) errs.cost = "Enter a valid amount.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const row = {
      name: f.name.trim(), provider: f.provider.trim(), cost_kobo: cost!, frequency: f.frequency,
      renewal_date: f.renewal_date || null, trial_end_date: f.trial_end_date || null,
      category: f.category.trim(), status: f.status, notes: f.notes.trim(),
    };
    const { error } = sub ? await supabase.from("st_subscriptions").update(row).eq("id", sub.id) : await supabase.from("st_subscriptions").insert(row);
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "Couldn't save this subscription."));
    toast.success(sub ? "Subscription updated." : "Subscription added.");
    qc.invalidateQueries({ queryKey: ["subtrack"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    onClose();
  }

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={sub ? "Edit subscription" : "Add subscription"} onSubmit={save} submitting={busy}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" required error={errors.name}><Input id="name" value={f.name} onChange={set("name")} /></Field>
        <Field id="provider" label="Provider"><Input id="provider" value={f.provider} onChange={set("provider")} /></Field>
        <Field id="cost" label="Cost (₦)" required error={errors.cost}><Input id="cost" inputMode="decimal" value={f.cost} onChange={set("cost")} /></Field>
        <Field id="freq" label="Billing frequency">
          <NativeSelect id="freq" value={f.frequency} onChange={set("frequency")}>
            {["weekly", "monthly", "quarterly", "yearly"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="renew" label="Next renewal"><Input id="renew" type="date" value={f.renewal_date} onChange={set("renewal_date")} /></Field>
        <Field id="trial" label="Trial ends"><Input id="trial" type="date" value={f.trial_end_date} onChange={set("trial_end_date")} /></Field>
        <Field id="cat" label="Category"><Input id="cat" value={f.category} onChange={set("category")} /></Field>
        <Field id="status" label="Status">
          <NativeSelect id="status" value={f.status} onChange={set("status")}>
            {["active", "paused", "cancelled"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="notes" label="Notes"><Textarea id="notes" value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}
