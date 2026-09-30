import { Lock, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Pill } from "@/components/common/ui-bits";
import type { ToolStatus } from "@/hooks/use-account";

export function ToolStatusBadge({ status }: { status: ToolStatus }) {
  switch (status) {
    case "unlocked":
      return <Pill tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> Unlocked</Pill>;
    case "pending":
      return <Pill tone="warning"><Clock className="h-3.5 w-3.5" /> Verification pending</Pill>;
    case "rejected":
      return <Pill tone="danger"><XCircle className="h-3.5 w-3.5" /> Payment rejected</Pill>;
    default:
      return <Pill><Lock className="h-3.5 w-3.5" /> Locked</Pill>;
  }
}

export function PaymentStatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") return <Pill tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> Approved</Pill>;
  if (status === "rejected") return <Pill tone="danger"><XCircle className="h-3.5 w-3.5" /> Rejected</Pill>;
  return <Pill tone="warning"><Clock className="h-3.5 w-3.5" /> Pending</Pill>;
}
