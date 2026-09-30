import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, LoadError, PageHeader } from "@/components/common/ui-bits";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-account";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Eminent Clicks" },
      { name: "description", content: "Updates about your payments and tools." },
      { property: "og:title", content: "Notifications — Eminent Clicks" },
      { property: "og:description", content: "Updates about your payments and tools." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", user.id, "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }),
    onError: () => toast.error("Unable to update notifications."),
  });
  const unread = q.data?.filter((n) => !n.read_at).length ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={unread > 0 && (
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck /> {markAll.isPending ? "Saving..." : "Mark all as read"}
          </Button>
        )}
      />
      {q.isLoading ? (
        <ListSkeleton />
      ) : q.isError ? (
        <LoadError message="Unable to load notifications." onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={BellOff} title="You're all caught up." description="Updates about your payments and tools will appear here." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {q.data.map((n) => (
            <li key={n.id} className={cn("flex gap-3 p-4", !n.read_at && "bg-secondary/40")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
              {n.link && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={n.link}>View</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
