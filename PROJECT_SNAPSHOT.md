# Project Snapshot — Aug 09, 2026

## Summary

Major hardening + implementation session. Since the last snapshot (July 28): a full codebase audit (Entry 2/3), a P0/P1 fix pass (Entry 4), an auth/webhooks/marketplace/worker implementation pass (Entry 5), and the **3D creation pipeline is now complete and verified end-to-end** with a simulated provider (Entry 6). Meshy/Tripo are drop-in later (`AI_PROVIDER=meshy` + `MESHY_API_KEY`).

**⚠️ One critical item is still BLOCKED: the live Supabase DB runs the OLD broken `deduct_credits` RPC — every credit deduction errors. The fix migration is written but cannot be applied because the project's `/sql` endpoints are disabled (needs the user's Transaction pooler connection string or pasting SQL into the Dashboard SQL Editor).**

---

## What Was Done (this session set)

### 1. Full codebase audit (Entry 2/3)
- Documented 50+ bugs/stubs/dead-code items in `log.md` (complete inventory with file:line refs).
- Identified 4 P0 blockers: broken `deduct_credits` SQL, job input key mismatch (`image_url` vs `image_urls`), Meshy/Tripo webhook routes not mounted, hardcoded secrets in `scripts/diag-*.ts`.

### 2. P0/P1 fixes (Entry 4)
- **`deduct_credits` fixed SQL** → new migration `supabase/migrations/20260808000000_fix_credit_rpcs.sql` (FOUND flag instead of bigint→boolean cast; positive-amount guard; owner/admin/service_role authorization inside RPCs; `REVOKE EXECUTE FROM PUBLIC`). **Written, NOT yet applied to live DB.**
- Job input keys unified to singular `image_url`; worker `resolveInputImage()` tolerates all shapes.
- `/api/webhooks/meshy` + `/api/webhooks/tripo` mounted in `server.ts`.
- Secrets stripped from `scripts/diag-*.ts` (env-only now); committed keys still need rotation.
- Pipeline hardening: job reaper (stuck `processing` > 10min), `input.task_id` persistence (no re-billing), retry jitter, credit refund on permanent failure, dead-letter requeue fixed, tenant keys (`business_id`) added to products/jobs from approve + Shopify webhook paths.
- Settings page rebuilt (server function, AES-GCM encrypted tokens, valid platform enum, real disconnect). Marketplace page fixed (unprocessed status, approve creates draft product + queued job).
- `.env.example` gained `SHOPIFY_WEBHOOK_SECRET`, `SESSION_SECRET`, `ENABLE_DEVELOPER_TOOLS`.

### 3. Implementation pass (Entry 5)
- `addCredits` now admin-only (app + DB consistent).
- Shopify webhook HMAC: auto-detects hex **and base64** (with trailing newline).
- `webhook_events` RLS leak fixed → migration `20260808000001_harden_webhook_events_rls.sql` (**written, NOT applied**).
- Marketplace connections mirror into `store_integrations` (dashboard "Active Integrations" card works).
- Worker `completeJob`/`failJob` + webhook `handleCompletion` CAS-guarded (3-state claim) — double webhooks no longer double-complete/email/refund.
- Email templates HTML-escaped; absolute canonical/OG URLs on public pages; embed script origin derived from app domain; `getProcessingJobs` product_id filter.

### 4. 3D creation pipeline complete (Entry 6) — the main event
- **`src/workers/providers.ts`** — provider abstraction (`createTask`/`pollTask`), Meshy + Tripo adapters moved here, new `simulatedAdapter` (sleeps `SIMULATED_GENERATION_MS`, completes with NO fake GLB — "ready-without-model").
- **`src/workers/job-worker.ts`** rewritten — retries resume persisted `task_id`, `requeuePending` 60s w/o retry bump, CAS fail/complete, reaper covers both states, refund only when `billed: true`.
- **`src/lib/generation.functions.ts`** — `enqueueAiGeneration`: ownership check, in-flight guard, deduct 1 credit, insert job, refund on failure.
- **`src/lib/model-notifications.ts`** — `notifyModelReady` sends via `sendEmail()` directly (NOT createServerFn — worker has no server runtime context). Used by worker + webhook paths.
- Charging is **explicit only**: "Generate with AI" button in ProductForm (auto-promotes first photo to thumbnail, saves, enqueues, polls 10s). No silent auto-deduct on save.
- **`src/workers/load-env.ts`** — worker auto-loads `.env`.

### 5. Verified end-to-end (live DB smoke test)
- Simulated job: `queued → processing → optimizing → ready`, output `{status:"completed", model_id:"sim_…"}`, no fake model artifacts, cleanup cascade OK.
- Email path exercised via Resend (recipient temporarily redirected to `.invalid` — nothing delivered, profile restored).
- `npm run typecheck` clean; `npm run test` 8 files / 93 tests pass; eslint on changed files — no new errors (repo-wide CRLF prettier noise is pre-existing).

---

## Current Feature Status

| Feature | Status |
|---------|--------|
| Auth (email signup/link, Google OAuth, reset, onboarding) | ✅ Working |
| Products CRUD + direct GLB/USDZ upload | ✅ Working |
| **AI 3D generation (simulated provider)** | ✅ Working end-to-end |
| Public AR page `/p/:slug` (SEO, OG, QR, analytics events) | ✅ Working |
| Embed widget (embed.js + asset-meta endpoint) | ✅ Working |
| Shopify webhook (create/update/delete) | ✅ Wired — needs `SHOPIFY_WEBHOOK_SECRET` set |
| Marketplace connections (settings) | ✅ Working (AES-GCM tokens) |
| Dashboard + Analytics (4 tabs) | ✅ Working |
| Admin job console | ✅ Working (no dead-letter UI) |
| Worker (poll loop, reaper, CAS) | ✅ Working |
| Meshy / Tripo adapters | ⚠️ Implemented, unverified (no API keys wired) |
| Amazon / Daraz adapters + webhooks | ❌ Stubs (return `[]`, ack-only) |

---

## What Still Needs Work (priority order)

| Item | Priority | Notes |
|------|----------|-------|
| **Apply 2 pending migrations to live DB** (`20260808000000_fix_credit_rpcs.sql` + `20260808000001_harden_webhook_events_rls.sql`) | 🔴 CRITICAL | `/sql` endpoints disabled on the project (`okoloionftfxyvscfvhh`); direct host is IPv6-only. Needs user's Transaction pooler URI (port 6543) or Dashboard SQL Editor paste. Until then **every credit deduction fails** and the webhook_events RLS leak persists. |
| Rotate leaked service-role/anon keys (were in git history) | High | Supabase Dashboard |
| Set `SHOPIFY_WEBHOOK_SECRET` in `.env` | High | `/api/webhooks/shopify` returns 503 until set |
| Re-verify `deduct_credits` + charged-enqueue smoke after migration | High | |
| Wire Meshy: `AI_PROVIDER=meshy` + `MESHY_API_KEY` | Medium | Drop-in; adapters already written |
| Real vendor sync adapters (Shopify Admin API, Amazon SP-API, Daraz) + `decryptToken` | Medium | All mocked (`return []`) — sync still charges a credit |
| Billing/credit purchase (Stripe) | Medium | Pricing CTAs → `/auth` |
| Amazon/Daraz webhook completion | Medium | ack-only stubs |
| Admin gate (`has_role`) is client-side only | Medium | |
| Job-console dead-letter UI | Low | |
| Test coverage for server functions + worker | Low | tests cover utilities/components only |
| Repo-wide CRLF lint noise | Low | pre-existing prettier issue |

---

## Files Changed (this session set)

### New Files
- `src/workers/providers.ts` — provider abstraction + meshy/tripo/simulated adapters
- `src/workers/load-env.ts` — `.env` loader for the worker
- `src/lib/generation.functions.ts` — `enqueueAiGeneration` (charge + enqueue)
- `src/lib/model-notifications.ts` — shared `notifyModelReady`
- `supabase/migrations/20260808000000_fix_credit_rpcs.sql` — **pending, not applied**
- `supabase/migrations/20260808000001_harden_webhook_events_rls.sql` — **pending, not applied**

### Modified (key files)
- `src/workers/job-worker.ts` (rewritten), `src/workers/runner.ts`
- `src/lib/products.functions.ts` (no auto-queue/deduct; listMyProducts enrichment), `jobs.functions.ts`, `webhooks.functions.ts`, `webhook-vendors.functions.ts`, `shopify-webhook.server.ts`, `marketplace.functions.ts`, `addCredits.functions.ts`, `config.server.ts`, `email.functions.ts`, `emails/templates.ts`
- `src/components/ProductForm.tsx` (real Generate button), `src/components/EmbedSnippet.tsx`
- `src/routes/_authenticated/products.tsx`, `products.$id.tsx`, `admin.tsx`, `settings.tsx`, `src/routes/p.$slug.tsx`, `src/routes/index.tsx`
- `src/server.ts` (meshy/tripo webhook mounts), `src/start.ts` (rate limit + auth)
- `scripts/diag-*.ts` (secrets removed), `.env.example`

### Live DB State (verified via service-role probes)
- Merchants present: `rapidify-demo` (`11111111-1111-1111-1111-111111111111`) + `demo-store-*` entries.
- `deduct_credits` → **404 `operator does not exist: boolean = integer`** (OLD broken version — confirms migration not applied).
- `add_credits` → 204; `webhook_events` → 200. All schema tables/columns present except `used_nonces` (ambiguous 403).
- No migrations have been applied via `scripts/run-migrations.ts` (all REST SQL paths disabled: `/sql`, `/api/sql`, `/pg/v1/sql` → 404 "requested path is invalid").

---

## Key Files For Context
- `log.md` — full session history, newest entry first (Entry 6 at top)
- `info/PRODUCT_FEATURE_GUIDE.md`, `info/ECOMMERCE_INTEGRATION_GUIDE.md` — product docs
- `supabase/config.toml` — ⚠️ `project_id = tcujcbwkginjfqworinz` is STALE (differs from `.env`'s `okoloionftfxyvscfvhh`)
