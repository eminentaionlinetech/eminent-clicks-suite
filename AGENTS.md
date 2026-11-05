<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture decisions
- PayChaser scheduled reminders run as a TanStack server route (`/api/public/jobs/process-invoice-reminders`) invoked by a managed HTTP schedule — never a Supabase Edge Function or hand-authored pg_cron HTTP job; the generated `authenticateCronRequest` helper owns caller auth. The dispatcher engine lives in `src/server/reminders-engine.ts` and is shared with the authenticated manual "Check Invoices Now" server function.
- Reminder delivery providers are read from server-only env secrets (RESEND_API_KEY, META_WHATSAPP_TOKEN, TERMII_API_KEY); a channel without its secrets is recorded `not_configured` and must never be reported as delivered.
