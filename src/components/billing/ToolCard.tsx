import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolStatusBadge } from "@/components/billing/StatusBadge";
import { PaymentDialog } from "@/components/billing/PaymentDialog";
import { formatNaira } from "@/lib/format";
import type { ToolDef } from "@/lib/tools";
import type { ToolStatus } from "@/hooks/use-account";
import type { ReactNode } from "react";

export function ToolCard({ tool, status, priceKobo, summary }: { tool: ToolDef; status: ToolStatus; priceKobo?: number; summary?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Icon = tool.icon;
  return (
    <article className="flex flex-col rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <ToolStatusBadge status={status} />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{tool.name}</h3>
      <p className="text-sm text-muted-foreground">{tool.short}</p>
      <div className="mt-4 flex-1">{summary}</div>
      <div className="mt-5 flex items-center justify-between gap-2 border-t pt-4">
        {status === "unlocked" ? (
          <span className="text-sm text-muted-foreground">Access active</span>
        ) : (
          <span className="font-display text-base font-semibold">{priceKobo != null ? formatNaira(priceKobo) : "—"}</span>
        )}
        {status === "unlocked" ? (
          <Button asChild size="sm">
            <Link to={tool.path}>Open <ArrowRight /></Link>
          </Button>
        ) : status === "pending" ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>View submission</Button>
        ) : status === "rejected" ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>View details</Button>
            <Button size="sm" onClick={() => setOpen(true)}>Resubmit</Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>Subscribe</Button>
        )}
      </div>
      <PaymentDialog toolId={tool.id} open={open} onOpenChange={setOpen} />
    </article>
  );
}
