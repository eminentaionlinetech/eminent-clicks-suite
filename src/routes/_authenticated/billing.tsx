import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { EmptyState, ListSkeleton, LoadError, PageHeader, StatCard } from "@/components/common/ui-bits";
import { PaymentStatusBadge } from "@/components/billing/StatusBadge";
import { TOOL_MAP, TOOLS, type ToolId } from "@/lib/tools";
import { formatDateTime, formatNaira } from "@/lib/format";
import { useMyPayments, useToolStatuses } from "@/hooks/use-account";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Eminent Clicks" },
      { name: "description", content: "Your payment submissions and tool access." },
      { property: "og:title", content: "Billing — Eminent Clicks" },
      { property: "og:description", content: "Your payment submissions and tool access." },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const payments = useMyPayments();
  const { statusFor } = useToolStatuses();
  const counts = { unlocked: 0, pending: 0, rejected: 0 } as Record<string, number>;
  TOOLS.forEach((t) => {
    const s = statusFor(t.id).status;
    if (s in counts) counts[s]++;
  });

  return (
    <>
      <PageHeader title="Billing" description="Payment history and the status of each tool on your account." />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Active tools" value={counts.unlocked} tone="success" />
        <StatCard label="Pending" value={counts.pending} tone="warning" />
        <StatCard label="Rejected" value={counts.rejected} tone="danger" />
      </div>
      <h2 className="mb-3 text-lg font-semibold">Payment history</h2>
      {payments.isLoading ? (
        <ListSkeleton />
      ) : payments.isError ? (
        <LoadError message="Unable to load your payment history." onRetry={() => payments.refetch()} />
      ) : !payments.data?.length ? (
        <EmptyState icon={CreditCard} title="No payment submissions yet." description="When you subscribe to a tool and upload a receipt, it will appear here." />
      ) : (
        <ul className="space-y-3">
          {payments.data.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{TOOL_MAP[p.tool_id as ToolId]?.name ?? p.tool_id}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.tracking_code}</p>
                </div>
                <PaymentStatusBadge status={p.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>Amount: <strong className="text-foreground">{formatNaira(p.amount_kobo)}</strong></span>
                <span>Submitted: {formatDateTime(p.submitted_at)}</span>
                {p.reviewed_at && <span>Reviewed: {formatDateTime(p.reviewed_at)}</span>}
              </div>
              {p.status === "rejected" && p.rejection_reason && (
                <p className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">Reason: {p.rejection_reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
