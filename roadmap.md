# Eminent Clicks roadmap

## Done
- [x] Backend: profiles, roles, tool prices, payments, tool access, notifications, audit log, all five tool tables with ownership + access rules
- [x] Secure actions: submit payment (tracking code, price from the server), approve and reject (admin only, safe to repeat)
- [x] Private file storage: receipts, job photos, claim documents
- [x] Auth pages: register, login, forgot and reset password
- [x] App layout, dashboard, billing, notifications, payment window with real upload progress, live status updates
- [x] Landing page, settings page, admin payments review, all five tool modules with real CRUD
- [x] Logo assets verified and shown across the site; Google site verification tag set
- [x] PayChaser automated reminders end-to-end: claiming (duplicate-safe, catch-up windows, bounded retries), dispatcher engine, hourly managed schedule, manual "Check Invoices Now", per-channel not-configured status

## Open
- [ ] Delivery provider secrets: RESEND_API_KEY + RESEND_FROM_EMAIL, META_WHATSAPP_TOKEN (+ phone number ID / template name), TERMII_API_KEY + TERMII_SENDER_ID — until added, channels record Not Configured and nothing sends
- [ ] Real message delivery test once a provider is configured (needs owner approval before contacting real customers)
- [ ] End-to-end and security testing
