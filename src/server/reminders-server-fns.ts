import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manual "Check Invoices Now": claims and immediately dispatches due reminders
 * for the signed-in user only (the database scopes the claim to the caller).
 * The hourly scheduler covers the same ground automatically.
 */
export const runMyRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runReminderSweep } = await import("./reminders-engine");
    const summary = await runReminderSweep({
      claimClient: context.supabase,
      limit: 20,
      recoverOnlyUserId: context.userId,
    });
    return summary;
  });
