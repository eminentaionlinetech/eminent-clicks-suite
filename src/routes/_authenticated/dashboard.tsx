import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, ListSkeleton, LoadError } from "@/components/common/ui-bits";
import { ToolCard } from "@/components/billing/ToolCard";
import { TOOLS, type ToolDef } from "@/lib/tools";
import { fetchToolSummary } from "@/lib/summaries";
import { useCurrentUser, useProfile, useToolPrices, useToolStatuses } from "@/hooks/use-account";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Eminent Clicks" },
      { name: "description", content: "Your Eminent Clicks tools and their current status." },
      { property: "og:title", content: "Dashboard — Eminent Clicks" },
      { property: "og:description", content: "Your Eminent Clicks tools and their current status." },
    ],
  }),
  component: Dashboard,
});

function ToolSummary({ tool, unlocked }: { tool: ToolDef; unlocked: boolean }) {
  const user = useCurrentUser();
  const q = useQuery({ queryKey: ["summary", user.id, tool.id, unlocked], queryFn: () => fetchToolSummary(tool.id) });
  if (q.isLoading) return <div className="h-12 animate-pulse rounded-lg bg-muted" />;
  if (q.isError) return <p className="text-xs text-destructive">Unable to load summary.</p>;
  return (
    <dl className="grid grid-cols-3 gap-2">
      {q.data?.map((l) => (
        <div key={l.label} className="rounded-lg bg-muted/60 px-2.5 py-2">
          <dt className="truncate text-[11px] text-muted-foreground">{l.label}</dt>
          <dd className="truncate text-sm font-semibold tabular-nums">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Dashboard() {
  const profile = useProfile();
  const prices = useToolPrices();
  const { statusFor, isLoading, isError } = useToolStatuses();
  const first = profile.data?.full_name?.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="My Dashboard"
        title="Welcome to Eminent Clicks"
        description={first ? `Hi ${first}. Each tool is activated separately — subscribe to the ones your business needs.` : "Each tool is activated separately — subscribe to the ones your business needs."}
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <LoadError message="Unable to load your tools." onRetry={() => window.location.reload()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((t) => {
            const s = statusFor(t.id).status;
            return (
              <ToolCard
                key={t.id}
                tool={t}
                status={s}
                priceKobo={prices.data?.find((p) => p.id === t.id)?.price_kobo}
                summary={<ToolSummary tool={t} unlocked={s === "unlocked"} />}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
