# Payments & Anti-Theft — Deployment Guide

Everything below must be done once for the secure ₹25/map flow to work in production.
Nothing here is live until steps 1–4 are complete.

---

## What changed (code, already done)

- **DB trigger** blocks clients from setting `payment_status` — only the server (service role) can. `supabase/migrations/20260601_lock_payment_status.sql`
- **Webhook** now verifies Cashfree's `x-webhook-signature` + confirms order via Get-Order API. `supabase/functions/cashfree-webhook/`
- **Order creation** is production-ready: ₹25 server-side, real phone, unique order id, prod/sandbox via env. `supabase/functions/create-cashfree-payment/`
- **App** no longer self-marks paid on the return URL — it trusts the webhook-set DB value. `src/App.tsx`
- **Preview** shows a watermarked, low-res sketch until paid; the 🔒 button opens payment. `src/screens/PreviewScreen.tsx`
- **Clean PDF is rendered ONLY on the server** (`api/render-pdf.ts`) after re-checking payment. The browser never produces a clean sheet. Renderer is isomorphic (`src/lib/render-env*.ts`, `src/lib/pdf-export.ts`).
- **Payment is confirmed server-side on return** (`supabase/functions/verify-payment/`) — the app calls it after the Cashfree redirect, it asks Cashfree directly if the order is PAID, then flips `payment_status` + grants 5 regens. This is what fixes "redirects home / asks to pay again" — it no longer depends on the webhook arriving or on client writes (which the trigger blocks with a 403).
- **AI image generation is server-side** (`api/generate-map.ts`): auth + regen-count enforced, result re-encoded to **lossless WebP**, stored in Supabase Storage, recorded in `image_generations` (cache → never re-hits the AI API for the same image).

---

## 1. Apply the database migrations

In the Supabase SQL editor (or `supabase db push`), run BOTH, in order:
1. `supabase/migrations/20260601_lock_payment_status.sql` — trigger locking `payment_status`.
2. `supabase/migrations/20260602_image_generations_and_regen.sql` — regen counters, `image_generations` table, server-only regen RPCs.

Verify it worked — both should be true:
- A normal user running `update projects set payment_status='paid'` from the app gets an error (this was the source of the 403).
- The webhook / verify-payment (service role) can still set it.

## 1b. Create the Supabase Storage bucket

Supabase → Storage → New bucket: name **`ai-maps`**, **public** (so the saved survey images can be shown + embedded). Generated images are stored here as lossless WebP.

## 2. Set Supabase Edge Function secrets

Supabase → Project → Edge Functions → Secrets (or `supabase secrets set KEY=value`):

| Secret | Value |
|---|---|
| `CASHFREE_ENV` | `production` (use `sandbox` while testing) |
| `CASHFREE_APP_ID` | your Cashfree app id |
| `CASHFREE_SECRET_KEY` | your Cashfree secret key |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (**keep secret**) |

Then deploy the functions:
```
supabase functions deploy create-cashfree-payment
supabase functions deploy verify-payment
supabase functions deploy cashfree-webhook
```
(`verify-payment` and `create-cashfree-payment` keep default JWT verification — they're called by the logged-in user. Only the webhook uses `--no-verify-jwt`, see below.)
**Important:** the webhook must NOT require a JWT (Cashfree calls it). Set it to no-verify-JWT:
`supabase functions deploy cashfree-webhook --no-verify-jwt`

## 3. Set Vercel environment variables

Vercel → Project → Settings → Environment Variables (Production + Preview):

| Var | Value |
|---|---|
| `VITE_CASHFREE_MODE` | `production` (or `sandbox`) |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (used only by `api/render-pdf`, never shipped to the browser) |

(`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` already exist for the client.)

## 4. Point Cashfree at the webhook

Cashfree dashboard → Developers → Webhooks → add:
`https://<your-project>.supabase.co/functions/v1/cashfree-webhook`
Event: **Payment Success**. Save. Send a test webhook — it should return 200 and (for a real order) flip the project to paid.

---

## End-to-end test (do in sandbox first)

1. Set `CASHFREE_ENV=sandbox` and `VITE_CASHFREE_MODE=sandbox`.
2. Make a map → on the preview the print button shows 🔒 and the sketch is watermarked + low-res.
3. Tap 🔒 → Cashfree sandbox checkout → pay with a test card.
4. Back in the app: it polls, the webhook flips `payment_status='paid'`, the 🔒 becomes 🖨️.
5. Tap 🖨️ → `/api/render-pdf` streams the clean, full-res PDF. Re-download works (unlimited for a paid map).
6. Flip to `production` + do one real ₹1-style live test, then go live at ₹25.

### Security checks
- Visit `/?payment=success&project_id=<id>` for an UNPAID project → it must stay unpaid (no self-unlock).
- In devtools, `supabase.from('projects').update({payment_status:'paid'})` → must be rejected by the trigger.
- POST a fake body to the webhook with a missing/invalid signature → must return 401.
- Call `/api/render-pdf` for an unpaid project → 402.

---

## Notes / still open

- **Server render time:** A single HLB (1–2 pages) renders well within Vercel's 60s function limit. Very large multi-block A3 exports pull more satellite tiles — if any time out, lower DPI for satellite pages.
- **Emoji** are stripped from the official sheet (server canvas has no emoji font); Hindi renders fully.
- **Phase 4 (not yet done):** throttle the satellite + AI image APIs behind an authed proxy so the free image quota can't be drained. Recommended before heavy public traffic.
- **First-map-free:** consider gating one free map per phone-verified user (you already store `is_mobile_verified`) so people try before paying.
