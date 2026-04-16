# Kivo Email System — Technical Handoff (Final)

## 1) Final architecture (implemented)

### Provider and channels
- **Resend** as outbound email provider.
- **Supabase Auth** for critical auth emails (via custom SMTP on Supabase dashboard).
- **Supabase Edge Function** for app transactional emails.

### Runtime pieces
- Auth templates (Supabase dashboard HTML source):
  - `supabase/auth/templates/confirm-signup.html`
  - `supabase/auth/templates/reset-password.html`
  - `supabase/auth/templates/password-changed.html`
  - secondary auth templates also available (`magic-link.html`, `change-email.html`)
- Transactional sender:
  - `supabase/functions/send-transactional-email/index.ts`
- Webhook ingestion:
  - `supabase/functions/resend-webhook/index.ts`
- Shared email UI system:
  - `supabase/functions/_shared/email-system/*`
- Observability storage:
  - `public.transactional_email_logs`
  - `public.transactional_email_webhook_events`

---

## 2) Where templates live

### Shared visual base
- `supabase/functions/_shared/email-system/tokens.ts`
- `supabase/functions/_shared/email-system/components.ts`
- `supabase/functions/_shared/email-system/layout.ts`

### Auth templates (HTML, Supabase Auth)
- `supabase/auth/templates/*.html`

### Transactional templates (TypeScript render switch)
- `supabase/functions/send-transactional-email/index.ts`
  - inside `renderTemplate(...)`

---

## 3) How to add a new template

### Transactional template (recommended path)
1. Add new key to `TemplateKey` in `send-transactional-email/index.ts`.
2. Add payload shape in `TemplatePayloadMap`.
3. Add `case` in `renderTemplate(...)` using shared UI helpers.
4. Decide if it needs idempotency and add to `IDEMPOTENT_TEMPLATES`.
5. Update `supabase/functions/send-transactional-email/readme.md` with payload and curl example.
6. Deploy function.

### Auth template
1. Add/edit HTML file in `supabase/auth/templates/`.
2. Paste HTML into Supabase Dashboard → Auth → Email Templates.
3. Validate redirect URL behavior in real flow.

---

## 4) How to configure a new sender

Current sender env pattern (Supabase secrets):
- `EMAIL_FROM_AUTH`
- `EMAIL_FROM_BILLING`
- `EMAIL_FROM_NOTIFY`
- `EMAIL_FROM_DEFAULT`

To add a new sender role:
1. Add env var (e.g. `EMAIL_FROM_SECURITY`).
2. Update selection logic in function if needed.
3. Verify sending domain in Resend (`mail.kivohub.com.br`).
4. Send test and confirm DMARC/SPF/DKIM pass.

---

## 5) Local test flow

### UI/template previews
- open generated previews:
  - `supabase/functions/_shared/email-system/previews/phase0-preview.html`
  - `supabase/functions/_shared/email-system/previews/auth-reset-preview.html`

### Transactional function test
- use curl examples in:
  - `supabase/functions/send-transactional-email/readme.md`

### Auth test
- signup / confirm
- forgot password / reset
- password changed notification

---

## 6) Logs and webhook operations

### Logs query (SQL)
```sql
select id, template_key, category, recipient, provider, provider_message_id, status, created_at, updated_at
from public.transactional_email_logs
order by created_at desc
limit 50;
```

### Webhook events query
```sql
select provider, event_id, event_type, provider_message_id, received_at
from public.transactional_email_webhook_events
order by received_at desc
limit 50;
```

### Webhook behavior
- Validates `resend-signature` with HMAC SHA-256 over **raw request body**.
- Processes events:
  - `email.sent`
  - `email.delivered`
  - `email.bounced`
  - `email.failed`
- Uses event table uniqueness for basic idempotency.

---

## 7) Environment variables

Reference file:
- `.env.example`

Main vars used:
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMAIL_FROM_DEFAULT`
- `EMAIL_FROM_NOTIFY`
- `EMAIL_FROM_AUTH`
- `EMAIL_FROM_BILLING`
- `APP_URL`
- `SUPPORT_EMAIL`
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_APP_URL`

---

## 8) DNS records required (sending)

Sending domain target:
- `mail.kivohub.com.br`

Required set (from Resend domain setup):
- DKIM TXT (selector under sending subdomain)
- SPF TXT (for configured mail host, avoid duplicate SPF on same host)
- MX for bounce/feedback host required by Resend region
- DMARC TXT (minimum: `p=none` while stabilizing)

Important:
- Do **not** duplicate SPF records on same DNS name.
- Do **not** alter main site A/CNAME unless necessary.

---

## 9) Operational checklist (future changes)

1. Confirm sender domain still verified in Resend.
2. Confirm Supabase Auth SMTP still active.
3. Add template changes in repo + dashboard (for auth).
4. Deploy updated Edge Functions.
5. Send one real test per changed template.
6. Validate links and redirects.
7. Validate log row creation and webhook status update.
8. Re-send same webhook payload and confirm duplicate ignored.
9. Record change note in release log.

---

## 10) Implemented now vs deferred

### Implemented now
- Shared Kivo email visual system.
- Auth critical templates.
- Transactional single function with typed payloads.
- Required core templates (welcome, subscription activated, payment failed, support received).
- Tags + idempotency key handling for critical sends.
- Minimal observability with logs + signed webhook + idempotent processing.
- Env reference and infra setup docs.

### Deferred intentionally (next phase)
- Full dashboard/BI for email metrics.
- Queue/retry worker architecture.
- Advanced webhook signature versioning strategy (if provider format changes).
- Multi-language template orchestration.
- Automated screenshot QA across many mailbox clients.

---

## Final state summary
- Codebase is structured for simple, maintainable transactional email operations.
- Core auth + transactional paths are implemented with minimal architecture.
- Production readiness now depends on final operational validation in Supabase/Resend dashboards and inbox-based E2E confirmation.
