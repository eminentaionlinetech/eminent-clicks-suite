import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ListSkeleton, LoadError, NoMatches, PageHeader, StatCard } from "@/components/common/ui-bits";
import { PaymentStatusBadge } from "@/components/billing/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, SearchInput } from "@/components/tools/kit";
import { TOOL_MAP, TOOLS, type ToolId } from "@/lib/tools";
import { formatDateTime, formatNaira, friendlyError } from "@/lib/format";
import { signedUrl } from "@/lib/receipt";
import { useIsAdmin } from "@/hooks/use-account";
import type { Payment } from "@/hooks/use-account";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Eminent Clicks" },
      { name: "description", content: "Review and verify payment submissions." },
      { property: "og:title", content: "Admin — Eminent Clicks" },
      { property: "og:description", content: "Review and verify payment submissions." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const isAdmin = useIsAdmin();
  if (isAdmin.isLoading) return <ListSkeleton />;
  if (!isAdmin.data) return <EmptyState icon={ShieldAlert} title="You don't have access to this page." />;
  return <AdminReview />;
}

function AdminReview() {
  const q = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_submissions").select("*").order("submitted_at", { ascending: false }).limit(500);
      if (error) throw error;
      const ids = [...new Set(data.map((p) => p.user_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
      const names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
      return data.map((p) => ({ ...p, full_name: (names[p.user_id] as string) ?? "" }));
    },
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const [tool, setTool] = useState("all");
  const [view, setView] = useState<(Payment & { full_name: string }) | null>(null);
  const list = q.data ?? [];
  const filtered = useMemo(
    () => list.filter((p) => (status === "all" || p.status === status) && (tool === "all" || p.tool_id === tool) && `${p.tracking_code} ${p.email} ${p.whatsapp} ${p.full_name}`.toLowerCase().includes(search.toLowerCase())),
    [list, search, status, tool],
  );
  const approved = list.filter((p) => p.status === "approved");

  return (
    <>
      <PageHeader eyebrow="Admin" title="Payment review" description="Verify receipts before unlocking tools." />
      {q.isLoading ? <ListSkeleton /> : q.isError ? <LoadError message="Unable to load payments." onRetry={() => q.refetch()} /> : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Pending" value={list.filter((p) => p.status === "pending").length} tone="warning" />
            <StatCard label="Approved" value={approved.length} tone="success" />
            <StatCard label="Rejected" value={list.filter((p) => p.status === "rejected").length} tone="danger" />
            <StatCard label="Verified revenue" value={formatNaira(approved.reduce((a, p) => a + p.amount_kobo, 0))} />
          </div>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Search tracking code, name, email, WhatsApp" />
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-40" aria-label="Status">
              {["all", "pending", "approved", "rejected"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </NativeSelect>
            <NativeSelect value={tool} onChange={(e) => setTool(e.target.value)} className="sm:w-40" aria-label="Tool">
              <option value="all">All tools</option>
              {TOOLS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
          </div>
          {list.length === 0 ? <EmptyState icon={Inbox} title="No payment submissions yet." /> : filtered.length === 0 ? (
            <NoMatches onClear={() => { setSearch(""); setStatus("all"); setTool("all"); }} />
          ) : (
            <ul className="space-y-3">
              {filtered.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-card">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.full_name || p.email} · {TOOL_MAP[p.tool_id as ToolId]?.name}</p>
                    <p className="text-sm text-muted-foreground"><span className="font-mono">{p.tracking_code}</span> · {formatNaira(p.amount_kobo)} · {formatDateTime(p.submitted_at)}</p>
                  </div>
                  <PaymentStatusBadge status={p.status} />
                  <Button size="sm" variant="outline" onClick={() => setView(p)}>Review</Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {view && <ReviewDialog p={view} onClose={() => setView(null)} />}
    </>
  );
}

function ReviewDialog({ p, onClose }: { p: Payment & { full_name: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const url = useQuery({ queryKey: ["receipt", p.receipt_path], queryFn: () => signedUrl("receipts", p.receipt_path, 600) });
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(kind: "approve" | "reject") {
    setBusy(true);
    const { error } = kind === "approve"
      ? await supabase.rpc("approve_payment", { _payment_id: p.id })
      : await supabase.rpc("reject_payment", { _payment_id: p.id, _reason: reason });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error, "That action didn't go through."));
    toast.success(kind === "approve" ? "Payment approved and tool unlocked." : "Payment rejected.");
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{p.tracking_code}</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Name</dt><dd>{p.full_name || "—"}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="break-all">{p.email}</dd>
          <dt className="text-muted-foreground">WhatsApp</dt><dd>{p.whatsapp}</dd>
          <dt className="text-muted-foreground">Tool</dt><dd>{TOOL_MAP[p.tool_id as ToolId]?.name}</dd>
          <dt className="text-muted-foreground">Amount</dt><dd>{formatNaira(p.amount_kobo)}</dd>
          <dt className="text-muted-foreground">Status</dt><dd><PaymentStatusBadge status={p.status} /></dd>
        </dl>
        {p.rejection_reason && <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">Reason: {p.rejection_reason}</p>}
        <div className="rounded-lg border bg-muted p-2">
          {url.isLoading ? <ListSkeleton rows={1} /> : url.isError ? <LoadError message="Couldn't load the receipt." /> : (
            <a href={url.data} target="_blank" rel="noopener noreferrer"><img src={url.data} alt="Payment receipt" className="mx-auto max-h-[60vh] object-contain" /></a>
          )}
        </div>
        {p.status === "pending" && (rejecting ? (
          <div className="space-y-2">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (shown to the customer)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy}>Back</Button>
              <Button variant="destructive" onClick={() => act("reject")} disabled={busy || reason.trim().length < 3}>Confirm rejection</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
            <Button onClick={() => act("approve")} disabled={busy}>Approve & unlock</Button>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
