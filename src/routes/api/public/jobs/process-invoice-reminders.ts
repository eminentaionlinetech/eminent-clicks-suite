import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled PayChaser reminder dispatcher.
 *
 * Called automatically by the managed HTTP schedule (hourly). The managed
 * bearer credential is verified with authenticateCronRequest — no other caller
 * is accepted. Each run claims due reminder tasks for ALL users, recovers
 * stale tasks from crashed runs, dispatches through configured providers and
 * records every attempt's result in the database.
 */
export const Route = createFileRoute("/api/public/jobs/process-invoice-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        try {
          const { runReminderSweep } = await import("@/server/reminders-engine");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const summary = await runReminderSweep({ claimClient: supabaseAdmin, limit: 50 });
          const startedAt = new Date().toISOString();
          console.log(
            `[reminders] sweep ${startedAt}: claimed=${summary.claimed} recovered=${summary.recovered} counts=${JSON.stringify(summary.counts)}`
          );
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error("[reminders] sweep failed:", detail);
          return Response.json({ ok: false, error: detail }, { status: 500 });
        }
      },
    },
  },
});
