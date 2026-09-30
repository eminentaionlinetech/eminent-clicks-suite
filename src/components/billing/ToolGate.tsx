import { useState, type ReactNode } from "react";
import { Lock, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton, LoadError } from "@/components/common/ui-bits";
import { PaymentDialog } from "@/components/billing/PaymentDialog";
import { TOOL_MAP, type ToolId } from "@/lib/tools";
import { formatNaira } from "@/lib/format";
import { useToolPrices, useToolStatuses } from "@/hooks/use-account";

/**
 * UI gate for a tool page. The real enforcement is on the backend: every tool table
 * only returns/accepts rows when the user holds an active entitlement.
 */
export function ToolGate({ toolId, children }: { toolId: ToolId; children: ReactNode }) {
  const { statusFor, isLoading, isError } = useToolStatuses();
  const prices = useToolPrices();
  const [open, setOpen] = useState(false);
  const tool = TOOL_MAP[toolId];

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError) return <LoadError message="Unable to check your access right now." onRetry={() => window.location.reload()} />;

  const { status, payment } = statusFor(toolId);
  if (status === "unlocked") return <>{children}</>;

  const price = prices.data?.find((p) => p.id === toolId)?.price_kobo;
  const Icon = tool.icon;
  return (
    <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-card">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">{tool.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
      <div className="mt-6 rounded-xl bg-muted/60 p-4 text-sm">
        {status === "pending" ? (
          <p className="flex items-center justify-center gap-2 font-medium"><Clock className="h-4 w-4 text-warning-foreground" /> An administrator is reviewing your payment ({payment?.tracking_code}).</p>
        ) : status === "rejected" ? (
          <p className="flex items-center justify-center gap-2 font-medium text-destructive"><XCircle className="h-4 w-4" /> Your payment submission was not approved.</p>
        ) : (
          <p className="flex items-center justify-center gap-2 font-medium"><Lock className="h-4 w-4" /> This tool is locked. Subscribe to unlock{price ? ` for ${formatNaira(price)}` : ""}.</p>
        )}
      </div>
      <Button className="mt-6" onClick={() => setOpen(true)}>
        {status === "pending" ? "View submission" : status === "rejected" ? "View details & resubmit" : "Subscribe"}
      </Button>
      <PaymentDialog toolId={toolId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
