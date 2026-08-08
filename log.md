# Session Log — Rapidify AR Commerce Suite

> How to use: Each session entry contains the prompt and the response in simple words. Copy anything you need from here.

---

## Entry 6 — 3D Creation Pipeline: Simulated Provider, Explicit Generate, End-to-End Verified (Aug 08, 2026)

### Prompt
> for now complete the 3d creation pipe line at the end of the project i will attach the meshy for creation

### Response (implementation)

Decisions (user-confirmed): the simulated provider is **"ready-without-model"** (job runs through every stage but produces no GLB, no fake assets), and charging happens **only** via an explicit "Generate with AI" button (saving a product never auto-charges or auto-queues).

1. **Provider layer** — `src/workers/providers.ts`: `ProviderAdapter {name, createTask, pollTask}`, `PollOutcome` (completed/pending/failed), `getProvider(name)`. Meshy + Tripo adapters moved here from `job-worker.ts`; new `simulatedAdapter` sleeps `SIMULATED_GENERATION_MS` (default 8000) then returns completed with empty `glb_url/usdz_url/thumbnail_url`. `AI_PROVIDER` env selects the default (`simulated` | `meshy` | `tripo`).
2. **Worker hardening** — `src/workers/job-worker.ts` rewritten: retries/requeues resume the persisted `input.task_id` (no duplicate paid tasks), `requeuePending` waits 60s without touching `retries`, `failJob` CAS-guards `status in (processing, optimizing)` and refunds only when `input.billed === true`, `completeJob` 3-state CAS returns a claimed flag, reaper scans `processing` + `optimizing`, and `notifyModelReady` runs only after a successful claim.
3. **Explicit enqueue + billing** — `src/lib/generation.functions.ts`: `enqueueAiGeneration({product_id})` checks ownership, rejects direct models / missing thumbnails / already-in-flight jobs, deducts 1 credit (deduct_credits RPC), inserts the job with the default provider, and refunds on insert failure. The silent auto-queue/deduct inside `upsertProduct` was removed.
4. **Model-ready email** — `src/lib/model-notifications.ts`: shared `notifyModelReady()` (worker + webhook paths). Resolves the owner via `business_profiles` (business_id ?? merchant_id) and emails via `sendEmail()` directly — NOT the `sendModelReadyEmail` createServerFn, because the standalone worker has no Start server runtime context (AsyncLocalStorage). The webhook path was switched to the same helper.
5. **UI** — `ProductForm.tsx`: real "Generate with AI" button (auto-promotes the first photo to thumbnail if missing, saves first, enqueues, differentiated toast for simulated vs real providers, in-flight detection with 10s polling, `Loader2` spinners). `products.tsx` shows an amber "Processing…" badge while `generating`; `products.$id.tsx` and `admin.tsx` poll while jobs are in flight.
6. **Worker env** — `src/workers/load-env.ts` + `runner.ts`: loads `.env` at worker startup (never overrides existing env vars). `.env.example` documents `AI_PROVIDER` + `SIMULATED_GENERATION_MS`.

**Verification:** `npm run typecheck` clean; `npm run test` 8 files / 93 tests pass; eslint on changed files — no new errors. **Live smoke test** (real Supabase DB, `scripts/smoke-pipeline.tmp.ts`): simulated job ran `queued → processing → optimizing → ready`, output `{status: "completed", model_id: "sim_…", glb_url/usdz_url/thumbnail_url: null}`, product model fields untouched, notifyModelReady exercised the Resend path end-to-end (recipient temporarily redirected to an invalid `.invalid` address so nothing was delivered; profile email restored), cleanup cascade deleted product + jobs. `RESULT: PASS`.

**Two Windows/worker bugs found & fixed during smoke:** (a) an unref'd sleep timer in the simulated provider crashed the worker (libuv teardown assertion with concurrent undici sockets) → plain `setTimeout`; (b) `notifyModelReady` used a createServerFn → "No Start context found" outside the server runtime → direct `sendEmail()`.

**DB changes still pending (CRITICAL):** the live DB still runs the OLD broken `deduct_credits` (boolean=integer cast error — every credit deduction fails). Migrations `20260808000000_fix_credit_rpcs.sql` + `20260808000001_harden_webhook_events_rls.sql` are written but NOT applied: the project's `/sql` endpoints are disabled and the direct DB host is IPv6-only, so applying needs the user's Transaction pooler connection string (port 6543) or pasting the SQL in the Dashboard SQL Editor. App-side `enqueueAiGeneration` uses `deduct_credits`, so generation will fail to charge until this lands.

**Issues remaining:** deduct_credits fix not applied (blocked on DB access), Meshy/Tripo adapters unverified (no API keys wired), credit purchase UI, Amazon/Daraz webhook completion, dead-vendor SDK adapters, repo-wide CRLF lint noise, secrets rotation.

**Next task:** apply the two pending migrations (user provides pooler URI or pastes SQL), then re-verify `deduct_credits` + a full charged-enqueue smoke; afterwards wire Meshy via `AI_PROVIDER=meshy` + `MESHY_API_KEY`.

---

## Entry 5 — Implementation Pass: Auth, Webhooks, Marketplace Mirror, Worker CAS (Aug 08, 2026)

### Prompt
> Move from audit to implementation. Fix the highest-priority verified issues; verify each against the current code first; report at the end (issues fixed, files changed, DB changes, Supabase actions, tests/results, issues remaining, next task).

### Response (fixes applied)

1. **Merchant self-top-up hole (fix A)** — `addCredits` (`src/lib/addCredits.functions.ts`) was open to any authenticated user. Now admin-only: `userId` (or service-role header) must have `admin` in `user_roles`, otherwise it 403s. DB already enforces this via the Entry 4 RPC migration (`add_credits` owner check + `REVOKE EXECUTE FROM PUBLIC`), so app + DB are now consistent.
2. **Shopify webhook signature validation (fix B)** — `validateWebhookSignature` (webhooks.functions.ts) only accepted hex HMACs; Shopify sends **base64** (sometimes with a trailing newline). Now auto-detects hex vs base64 (trimmed) and passes those through to the vendor-specific check.
3. **webhook_events RLS leak (fix C)** — new migration `supabase/migrations/20260808000001_harden_webhook_events_rls.sql`: webhook events with `NULL merchant_id` (pre-pipeline rows / Amazon & Daraz mocks) were visible to ALL authenticated users via the owner-read policy. Now the owner-read policy requires a matching non-null merchant_id, and service_role is granted full access.
4. **Marketplace connection mirror (fix D)** — `createMarketplaceConnection` (marketplace.functions.ts) now inserts a mirror row into `store_integrations` so the "Active Integrations" dashboard card works; `deleteMarketplaceConnection` removes the mirror. `store_integrations` row keeps `active: false` until the real sync adapter lands.
5. **Worker completion hardening (fix E)** — `handleCompletion` (webhook.functions.ts): direct JSONB lookup of `job.input->>'task_id'` instead of scanning the last 50 jobs; completion now CAS-guards via a 3-state condition (`queued OR processing OR optimizing`) + `select`; failure path CAS-guards too (`queued OR processing OR optimizing`) and refunds only when the claim succeeded — a double webhook no longer double-completes, double-emails, or double-refunds. The worker's own `completeJob`/`failJob` got the same 3-state CAS guards.
6. **Email HTML injection (fix F)** — `src/lib/emails/templates.ts` escaped merchant/product/user names with `escapeHtml()` in every template.
7. **Absolute canonical/OG URLs** — `src/routes/p.$slug.tsx` and `src/routes/index.tsx` now emit absolute URLs for canonical/og:image/og:url (SSR origin via `getRequest()`, client origin via `window.location.origin`).
8. **Embed script URL** — `EmbedSnippet.tsx` no longer hardcodes `https://rapidify.app/embed.js`; it derives the origin from the app domain (falls back to rapidify.app), fixing local/staging/testing.
9. **Product edit page** — `getProcessingJobs` accepts an optional `product_id` filter (server-side) instead of filtering 50 rows client-side; removed the dead non-CAS `completeJob` in `jobs.functions.ts`.

**Verified current-state before each change** (all edits were grounded in the actual code; embedding of supposed prior fixes was verified, not assumed).

**Verification:** `npm run typecheck` clean; `npm run test` 8 files / 93 tests pass; `eslint` scoped to changed files — no new errors (repo-wide CRLF prettier noise is pre-existing and untouched).

**DB change:** run `npx tsx scripts/run-migrations.ts` to apply `20260808000001_harden_webhook_events_rls.sql` (already done for earlier migrations). **Supabase:** nothing else required; rotate leaked keys from Entry 4 if not done.

**Issues remaining:** dead vendor SDK adapters (return `[]`), ProductForm AI generation is an `alert()` stub, billing/credit purchase, Amazon/Daraz webhook completion, job-console dead-letter UI, repo-wide CRLF lint noise, secrets rotation, `getEmbedScript` still returns a relative `/embed.js` (internal use only).

**Next task:** real Shopify pull adapter + `decryptToken`, or job-console dead-letter UI, or `trackEvent` dashboard; then P2 features.

---

## Entry 4 — P0/P1 Fix Pass (Aug 08, 2026)

### Prompt
> Continue the re-read + audit, then fix the P0/P1 issues from the todo list.

### Response (fixes applied)

**P0 — blockers fixed:**
1. **`deduct_credits` broken SQL** — new migration `supabase/migrations/20260808000000_fix_credit_rpcs.sql`. Replaced the `GET DIAGNOSTICS _ok = ROW_COUNT` bigint→boolean cast bug with the `FOUND` flag; added positive-amount guard; added authorization inside both RPCs (owner / merchant_members / admin / service_role for deduct; admin / service_role only for add); `REVOKE EXECUTE FROM PUBLIC` + re-grant to `authenticated, service_role`.
2. **Job input keys** — all enqueue paths now send singular `image_url` (products.functions.ts, marketplace.functions.ts, webhook-vendors.functions.ts). Worker (`job-worker.ts`) gained `resolveInputImage()` that tolerates `image_url` / `image_urls` / `imageUrls` shapes and fails fast with a clear error when no image exists.
3. **Meshy/Tripo webhook 404** — added raw HTTP handlers `handleMeshyWebhookRequest` / `handleTripoWebhookRequest` (reuse the shared `handleCompletion`) and mounted `/api/webhooks/meshy` + `/api/webhooks/tripo` in `server.ts`.
4. **Hardcoded secrets** — `scripts/diag-deep.ts` and `scripts/diag-trigger.ts` now read `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / anon key from env and exit with instructions when missing. Committed keys should still be **rotated** in the Supabase dashboard (they were public in git history).

**P1 — pipeline hardening:**
5. **Job reaper** — `reapStaleJobs()` in job-worker.ts requeues jobs stuck in `processing` for > 10 min (increments retries; permanent-fails at max_retries). Runs at the start of every worker cycle.
6. **Task id persistence + jitter + refunds** — worker persists `input.task_id` after creating a provider task (retries no longer re-create + re-bill). Retry backoff now includes jitter. Jobs enqueued with `billed: true` (product form, marketplace approve) get a 1-credit refund (`processing_job_refund`) on permanent failure — in both the worker and the webhook failure path.
7. **Dead-letter requeue fixed** — `requeueDeadLetterJob` always threw ("Max retries exceeded") because dead letters have `retries >= max_retries` by definition; now resets retries to 0 and requeues with a 30s delay.
8. **Tenant keys** — products/jobs created by `approveCatalogItem` and the Shopify vendor webhook now include `business_id` (previously missing → invisible under RLS, worker `models` upsert failed).
9. **Settings page rebuilt** — connects via the server function `createMarketplaceConnection` (AES-GCM encrypted token, status `active`, valid platform enum `daraz/amazon/shopify`), loads real connections via `listMarketplaceConnections`, adds store-URL + token inputs, working Disconnect button. Old client-side `btoa()` + `status:"pending"` (CHECK violation) + WooCommerce path removed.
10. **Marketplace page** — catalog list queries `unprocessed` (items are never written as `pending`), approve now passes `create_processing_job: true` (creates draft product + queued 3D job), connect form requires a real API token.
11. **.env.example** — added `SHOPIFY_WEBHOOK_SECRET`, `SESSION_SECRET`, `ENABLE_DEVELOPER_TOOLS` with comments.

**Verification:** `npm run typecheck` clean, `npm run test` 8 files / 93 tests pass.

**Still open (P2/P3):** real vendor SDK adapters (currently return `[]`), real AI-generation UI in ProductForm (alert stub), billing/credit purchase, Amazon/Daraz webhook completion, job-console dead-letter UI, test coverage for server functions + worker, absolute canonical/OG URLs, embed.js relative-URL inconsistency.

**To apply the DB fix:** run `npx tsx scripts/run-migrations.ts` (applies `20260808000000_fix_credit_rpcs.sql`) and rotate the leaked service/anon keys.

---

## Entry 2 — Codebase Audit (Aug 08, 2026)

### Prompt (2nd last)
> go thrugh the project codebase and tell mw what things are missing and also what should we work on next

### Response (2nd last)
> Audit complete. Here's what I found across the codebase:
>
> ## 🔴 Critical Bugs (break existing features)
>
> 1. **`deduct_credits` RPC is broken SQL** — `supabase/migrations/20260628000001_credit_system.sql:119-120` casts `ROW_COUNT` (bigint) to boolean and compares `boolean = 0` — PostgreSQL raises an error on **every call**. All 7 callers (`credits.functions.ts:106`, `jobs.functions.ts:34`, `products.functions.ts:162`, `marketplace.functions.ts:173,293`) mask it with `if (!ok) throw "Insufficient credits"`. This blocks AI job queueing, marketplace sync, and product creation. (Also: deployed DB may differ from migration — they patch functions in Dashboard.)
> 2. **Job input key mismatch** — worker reads `input.image_url` (singular) but 3 of 4 enqueue paths supply `image_urls` (plural) or nothing (`products.functions.ts:169`, `webhook-vendors.functions.ts:97`, `marketplace.functions.ts:335`). Only the Shopify webhook path is correct. AI generation from the product form would fail at the provider.
> 3. **Meshy/Tripo webhooks 404** — worker advertises `/api/webhooks/meshy` & `/api/webhooks/tripo` (job-worker.ts:136,220) but no routes are mounted in `server.ts` — provider callbacks fail.
> 4. **Hardcoded live Supabase service-role + anon keys** committed in `scripts/diag-deep.ts:3-5` and `scripts/diag-trigger.ts` — security issue, needs rotation.
>
> ## 🟠 Pipeline reliability gaps
>
> 5. **Stuck jobs**: worker crash leaves jobs in `processing` forever — no reaper/heartbeat/visibility timeout.
> 6. **Retries double-bill**: provider `task_id` never persisted; each retry re-creates a paid Meshy/Tripo task.
> 7. **Dead-letter requeue is dead code** (`jobs.functions.ts:248`) — always throws for actual dead letters; no jitter; no credit refund on permanent failure.
> 8. **Duplicate Shopify webhook paths** — createServerFn version (`webhook-vendors.functions.ts`) + raw HTTP version (`shopify-webhook.server.ts`); neither secret is in `.env` so the wired route 503s.
> 9. **Email**: no queue/retry/outbox (fire-and-forget), `sendWelcomeEmail` is dead code, sending from test domain `onboarding@resend.dev`.
>
> ## 🟡 Stubs & missing features
>
> 10. **All 3 vendor adapters return `[]`**; no `decryptToken` helper; no SDKs installed. Amazon/Daraz webhooks are ack-only stubs.
> 11. **Settings page is stubbed** — `existingConnection={null}` always, "Manage" button inert, tokens stored base64 (`settings.tsx:72`), platform mismatch (WooCommerce vs Amazon).
> 12. **AI generation in ProductForm is a UI stub** — just an `alert()`.
> 13. **No billing/credits purchase** — pricing CTAs link to `/auth`; `CREDIT_COSTS` hardcoded with a TODO.
> 14. **Env vars missing from `.env.example`**: `SESSION_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `SUPABASE_ANON_KEY`, `ENABLE_DEVELOPER_TOOLS`, rate-limit vars.
> 15. **Tests cover only utilities/components** — zero coverage of server functions, webhooks, worker, or routes.
>
> ## 🎯 Suggested work order
>
> | Phase | Work |
> |-------|------|
> | **P0 — Fix blockers** | Fix `deduct_credits` SQL + surface RPC errors in TS; fix job input keys; mount meshy/tripo webhook routes; strip secrets from scripts |
> | **P1 — Pipeline hardening** | Job reaper (stuck `processing`), persist `task_id`, retry jitter, credit refunds, fix dead-letter requeue, worker concurrency |
> | **P2 — Real integrations** | Shopify pull adapter (real Admin API), decryptToken + OAuth refresh, set webhook secrets, consolidate duplicate Shopify handlers, email outbox |
> | **P3 — Features** | Real settings page, billing/credit purchase, Amazon/Daraz webhooks, test coverage for server functions + worker |
>
> Where would you like to start? My recommendation is **P0** (items 1–3) — they're the highest-leverage fixes that unblock the product's core loop (create product → AI generate → view AR).

---

## Entry 3 — Full Deep Analysis of the Entire Codebase (Aug 08, 2026)

### Prompt
> Agent go through the whole file code base and give me the deep analysis and also like tell me about every feature and every each and every single detail of the go paste and then paste that into the log File

### Response

---

# DEEP ANALYSIS — Rapidify AR Commerce Suite (Complete)

## 1. WHAT THIS APP IS (Overview)

An **AR (Augmented Reality) e-commerce platform** built as a multi-tenant SaaS. Merchants sign up, create products, upload or AI-generate 3D models (GLB/USDZ), and get a public AR product page (`/p/:slug`) plus a copy-paste **embed widget** for their existing online store (Shopify, Daraz, Amazon, WooCommerce).

**Tech stack:** TanStack Start + TanStack Router + TanStack Query (React 19), Vite 7, Supabase (PostgreSQL + Auth + Storage), Zod validation, Resend email, Vitest tests, TypeScript, Tailwind CSS 4 + shadcn/ui.

**The 3 core loops of the product:**
1. **Create Product** → upload GLB/USDZ directly (instant) OR trigger AI 2D→3D generation (Meshy/Tripo, queued job)
2. **Share** → public page `/p/:slug` (SEO + QR + analytics) and embed widget on the merchant's store
3. **Track** → full analytics (views, AR launches, purchases, funnel, realtime)

---

## 2. AUTH SYSTEM (complete)

**Server functions** (`src/lib/auth.functions.ts`):
- `signupUser` — POST, public. Creates user via `supabaseAdmin.auth.admin.generateLink({type:"signup"})` then emails a 24h verification link (Resend). Returns `{success, emailSent}`. Friendly error when email already registered. No session created until link clicked.

**Routes:**
- `/auth` (`src/routes/auth.tsx`, 443 lines) — one page, 3 modes: sign in, sign up, forgot password. Also a layout for sub-routes.
  - Login: `signInWithPassword`; sniffs error messages to auto-switch to signup mode for unknown emails; blocks unconfirmed users (toast + signOut); success → routes via `getPostAuthDestination`.
  - Google OAuth: `signInWithOAuth` with `access_type=offline&prompt=consent`.
  - Redirects to `/dashboard` or `/auth/onboarding` if already logged in.
- `/auth/callback` — handles OAuth + email-link returns: getSession (300ms retry), checks email confirmed, calls `ensureBusinessProfile()`, then routes. Cleanup prevents setState-after-unmount.
- `/auth/onboarding` — merchant profile form (full name, business name, marketplace, store domain, country, business email, seller ID). `beforeLoad` guard redirects finished users to dashboard. Dev-only "Quick Demo Setup" button.
- `/auth/update-password` — new password form after reset link; signs out after change.

**Routing helpers:**
- `getPostAuthDestination` (`src/lib/auth-routing.ts`) — reads `business_profiles`; missing/error → onboarding; row exists → dashboard.
- `_authenticated/route.tsx` — route-group guard: session required; fast-path via `app_metadata.onboarding_completed_at`; falls back to `business_profiles` then legacy `profiles`; else redirect to onboarding.

**Middleware (global, `src/start.ts`):**
- `attachSupabaseAuth` (client-side) — injects `Authorization: Bearer <access_token>` into every serverFn call.
- `rateLimitMiddleware` (server-side) — in-memory fixed-window: public paths (`/p/`, `/embed/`, `/api/track`) = 30 req/min; everything else = 200 req/min.
- `requireSupabaseAuth` (per-fn) — verifies JWT via `supabase.auth.getClaims()`, builds per-request Supabase client (RLS-scoped), exposes `{supabase, userId, claims}`. Used by 64 server functions.

**Security layer** (`src/lib/security.functions.ts`):
- `sanitizeHtml` (XSS escape), `validateWebhookSignature` (HMAC-SHA256 via WebCrypto), rate-limit store with cleanup, `preventReplayAttack` (nonce+timestamp, DB-persisted), `auditLog`, `validateTenantAccess` — the last 4 are **dead code** (never called).

**Findings:** email enumeration leak on signup (reset hides it — inconsistent); client-supplied `redirectTo` not allow-listed; webhook verification disabled when secrets unset (fail-open); rate limit trusts `x-forwarded-for`; admin role check is client-side only.

---

## 3. MERCHANT / WORKSPACE MODEL

**Two tenant keys exist:**
- `business_id` = `auth.users.id` (modern key, used by all production tables: products, jobs, analytics, connections, models)
- `merchant_id` = random UUID in `merchants` table (legacy key, `owner_id` points to the auth user)

**Tables:** `merchants` (slug unique, name, logo, brand_color, store_domain, marketplace), `merchant_members` (roles: owner/admin/member, UNIQUE(merchant_id,user_id)), `business_profiles` (id = auth user id, onboarding_completed_at, business_email, is_verified, etc.).

**Key functions** (`src/lib/merchant.functions.ts`):
- `ensureBusinessProfile` — idempotent upsert of business_profiles on callback.
- `completeOnboarding` — 7-step: upsert profile (with onboarding_completed_at, is_verified:false) → read-after-write verify → find/create merchant with unique slug → upsert merchant_members (owner) → upsert store_integrations (non-fatal) → fire-and-forget welcome email → return.
- `devQuickSetup` — dev-only service-role setup (app_metadata + demo profile + demo merchant).
- `uniqueMerchantSlug` — slugify + `-1..-19` suffixes, fallback `-{userId8}`.

**Note:** no `handle_new_user` trigger exists in this repo; the real signup trigger is `on_auth_user_created_business_profile` → `create_business_profile_for_auth_user()` (created in migration 20260712000000).

---

## 4. PRODUCTS (full CRUD + AR)

**Functions** (`src/lib/products.functions.ts`):
- `getPublicProduct({slug})` — public, active only, + merchant info + variants (separate queries to avoid join schema issues).
- `listFeaturedProducts()` — public, 12 newest active.
- `listMyProducts()` — auth, by `business_id`, adds computed `sku`, `model_url`, `ar_ready`.
- `getMyProduct({id})` — auth + ownership, + variants.
- `upsertProduct(data)` — auth. Create path: if no direct GLB/USDZ → deduct credit (RPC) + queue `processing_job` (meshy, retries 0, max 5); if insufficient credit → product is rolled back (deleted) and error thrown. Update path never deducts/queues.
- `deleteProduct({id})` — auth; **does not delete storage files or jobs**.
- `getMobileARAsset({productId})` — payload for the Flutter mobile app (LiDAR scanner).
- `finalizeDirectUpload({product_id, model_glb_url, ...})` — called by the mobile app after a scan: ownership check, update product, upsert `models` row, flush queued jobs to ready.

**Product table columns:** id, merchant_id, business_id, slug (UNIQUE), title, description, price_cents, currency, thumbnail_url, image_url, model_glb_url, model_usdz_url, external_product_id, external_sku, buy_url, status (draft/active/archived), created_at, updated_at.

**Product form** (`src/components/ProductForm.tsx`, 484 lines): Product details (title, description, price, currency, slug, buy URL, status) + Option A "3D Capture & Direct Upload" (GLB/USDZ drag-drop dropzones, QR code for mobile LiDAR scanning on existing products, instant live) + Option B "AI 2D-to-3D Generation" (thumbnail + 3–5 multi-angle photos, **STUB — button just shows an alert**, photos are never uploaded or queued) + thumbnail fallback panel.

**Direct upload path:** browser `supabase.storage.from(bucket).upload(path, file)` with path `{bucket}/{timestamp}-{random}.{ext}` → `getPublicUrl`. (The deterministic `merchantId/products/{productId}/model.glb` helpers in storage.ts are dead code.)

---

## 5. AR VIEWER & EMBED SYSTEM

**ARViewer component** — wraps `<model-viewer>` (v3.5.0 loaded globally from Google CDN in `__root.tsx`): `ar-modes="webxr scene-viewer quick-look"`, `ar-placement="floor"`, `ar-scale="auto"`, camera-controls, auto-rotate, poster. Fires `onArLaunch`/`onArSessionEnd` from `ar-status` events. Fallback message when no GLB. 7 tests pass.

**Public page `/p/:slug`** — SEO title/description/OG/canonical (**relative URLs — bug**)/JSON-LD Product schema; variant swatches; price via Intl currency; Buy Now → buy_url; Share/QR modal (QRModal, 320px, dark theme); tracking fires: page_view, product_view (mount), ar_launch/ar_session_end (ARViewer), variant_switch, add_to_cart + buy_click (buy button), qr_open.

**Embed widget (3 parts):**
1. `public/embed.js` (137 lines vanilla JS) — auto-detects SKU from the page (itemprop, meta tags, data-sku, Amazon ASIN detection incl. URL regex), calls `/api/public/asset-meta`, mounts a "View in 3D / AR" button. Mobile → navigates to `/p/{slug}`; desktop → handoff overlay with link. Fail-closed (invisible on error).
2. `/api/public/asset-meta` endpoint (`public-asset-meta.server.ts`) — public CORS handler: resolves merchant by slug, product by SKU or slug (merchant-scoped to prevent cross-tenant SKU collisions), readiness from latest `models` row (or direct URLs). Returns ready/model_status/product_id/slug/sku/title/image/model/usdz URLs.
3. `getEmbedScript` server fn + `EmbedSnippet` component (copy buttons) — generates `<script src="/embed.js" data-merchant="..." data-external-sku="..." data-mount=".product-buy-button" defer>`. **Inconsistency: server fn emits relative `/embed.js`, the UI component emits `https://rapidify.app/embed.js`.**

**Embed page `/embed/:slug`** — fullscreen ARViewer, fires embed_open + ar_launch(source: embed). No variant support.

---

## 6. MARKETPLACE CONNECTIONS & SYNC

**Functions** (`src/lib/marketplace.functions.ts`):
- `listMarketplaceConnections`, `createMarketplaceConnection` (resolves merchant, **encrypts token with AES-GCM** `encryptToken` using SESSION_SECRET, status "active"), `deleteMarketplaceConnection`, `syncExternalInventory`, `listExternalCatalogItems`, `approveCatalogItem` (deducts credit if creating a job, creates draft product + queued meshy job), `rejectCatalogItem`.

**Sync pipeline (`syncExternalInventory`):** verify ownership → deduct 1 credit → call vendor adapter → upsert into `external_catalog_items` (onConflict connection_id+external_sku) → stamp `last_sync_at`. Returns `{synced, total}`.

**⚠️ The 3 vendor adapters are ALL MOCKED** (return `[]`):
```ts
fetchDarazCatalog  // TODO: real Daraz Open Platform SDK
fetchAmazonCatalog // TODO: real Amazon SP-API
fetchShopifyCatalog // TODO: real Shopify Admin API
```
So every "Sync now" returns 0 items but still charges a credit. **No `decryptToken` exists** — the encrypted token is passed to adapters as if it were the token. No vendor SDKs installed.

**Settings page** (`src/routes/_authenticated/settings.tsx`): 3 platform cards (Shopify/Daraz/**WooCommerce**) — but:
- `ConnectionCard` is always rendered with `existingConnection={null}` → status badges and Manage button are dead UI
- "Manage" button has **no onClick**
- Connect inserts via **client-side** supabase with `oauth_token_hash: btoa(token)` — **plain base64, not encrypted**, `status:"pending"` which **violates the DB CHECK constraint** (`active/expired/revoked/error`) → always errors
- WooCommerce is not in the platform CHECK constraint (daraz/amazon/shopify) → also fails
- `/marketplace` hardcodes `access_token: "pending"` (no real OAuth anywhere)
- `/marketplace` queries catalog items with `status:"pending"` but items are written as `"unprocessed"` → **pending list is always empty**

---

## 7. WEBHOOKS

**Shopify — REAL, wired at `POST /api/webhooks/shopify`** (`src/lib/shopify-webhook.server.ts`):
- `verifyShopifyHmac` — HMAC-SHA256, constant-time compare
- `handleShopifyWebhookRequest` — 405 guard → JSON parse → **503 if secret not configured** → HMAC → `resolveBusinessId` (via `store_integrations`, falls back to `marketplace_connections` ilike) → logs to `webhook_logs` → `syncShopifyProduct`
- `syncShopifyProduct` — handles create/update/**delete** (archives), deterministic slug `shopify-{business8}-{externalId}`, looks up by external_product_id first (avoids SKU-change conflicts), upserts with onConflict business_id+external_sku, de-dupes jobs (skips if queued/processing/optimizing), queues meshy job with **correct** `input.image_url` (singular).
- ⚠️ **Neither `SHOPIFY_WEBHOOK_SECRET` nor `SHOPIFY_CLIENT_SECRET` is set in .env → route returns 503.**

**Amazon & Daraz — STUBS** (`src/lib/webhook-vendors.functions.ts`): signature check (only if secret set, else fail-open), event logging with `merchantId: null`, then "Acknowledged" with TODO comments. Not wired to any real route.

**Duplicate Shopify path:** the older createServerFn `handleShopifyWebhook` in webhook-vendors is parallel to the raw HTTP one — potential conflict; doesn't handle delete; writes to `webhook_events` (the other writes to `webhook_logs` — two parallel audit systems).

**Meshy/Tripo provider webhooks** (`src/lib/webhooks.functions.ts`): `handleCompletion` matches jobs by scanning last 50 `processing` jobs for `input.task_id` or `output.model_id`; SUCCEEDED → transfer GLB/USDZ/thumbnail → update product → upsert models → mark job ready → **sendModelReadyEmail**. FAILED/EXPIRED → exponential backoff requeue or permanent fail.
**⚠️ These endpoints are NOT mounted in server.ts → provider callbacks 404.** Also no signature verification. The worker's poll path and webhook path can both complete a job (double completion race).

---

## 8. JOB WORKER & AI 3D PIPELINE

**Runner** (`src/workers/runner.ts`): 30s poll loop, 5s startup delay, backoff (doubles interval after 10 consecutive failures, cap 5min), graceful shutdown on SIGINT/SIGTERM, uncaught errors logged-not-killed. **`--cron` flag is ignored (worker:cron is identical to worker).**

**Worker** (`src/workers/job-worker.ts`):
- `getJobsToProcess` — oldest 5 queued + due jobs (MAX_CONCURRENT_JOBS caps batch, jobs run **sequentially**)
- `acquireJob` — atomic CAS queued→processing (safe with multiple workers)
- Meshy: POST `/v1/image-to-3d` (image_url, prompt, enable_pbr, topology, target_polycount 30k, webhook_url), poll every 3s up to 60s timeout
- Tripo: POST `/task` type image_to_model (file jpg url, model_version v2.0-20240919), poll; **USDZ = GLB (no real USDZ for Tripo)**
- `persistAssets` — download GLB/USDZ/thumb → upload to storage (mime + size checks) → update product URLs → upsert models (only if business_id set)
- `failJob` — exponential backoff 2^retries seconds (no jitter), permanent fail after max_retries (5), **no credit refund on permanent failure, provider task_id never persisted (retries re-create + re-bill tasks)**
- **No stuck-job reaper**: a worker crash leaves jobs in `processing` forever
- **Input key bug:** worker reads `input.image_url` but products.functions sends `{source:"manual_upload"}` (no image), marketplace and webhook-vendors send `image_urls` (plural) — only Shopify webhook is correct

**Job admin functions** (`src/lib/jobs.functions.ts`): `createProcessingJob` (never called anywhere — dead), `getProcessingJobs`, `processJob` (start/retry/fail actions), `getDeadLetterJobs` (failed + retries>=5), `requeueDeadLetterJob` (**always throws for real dead letters** — dead code).

---

## 9. CREDITS & BILLING

**Costs** (`src/lib/credits.functions.ts`): `processing_job: 1`, `marketplace_sync: 1`, `ai_generation: 2` (hardcoded, TODO to move to config). Free 10-credit welcome bonus via trigger `on_merchant_created_seed_credits`.

**Functions:** `getCreditBalance` (sidebar shows balance), `checkCreditBalance`, `deductCredits`, `addCredits` (admin-gated via has_role), `deductForProcessingJob` + `deductForMarketplaceSync` (both dead code).

**SQL RPCs** (`supabase/migrations/20260628000001_credit_system.sql`):
- `deduct_credits` — atomic UPDATE with `balance >= amount` guard, ledger insert; **has a PL/pgSQL type-cast bug** (`GET DIAGNOSTICS _ok = ROW_COUNT` assigning bigint to boolean, `IF NOT _ok OR _ok = 0` comparing boolean with integer) — the PostgreSQL error fires on every call, and all 7 TS callers mask it as "Insufficient credits".
- `add_credits` — upsert balance + ledger.
- **🔴 SECURITY HOLE: both RPCs are SECURITY DEFINER and EXECUTE is granted to PUBLIC** — any client can call `add_credits`/`deduct_credits` for any merchant_id (minting/draining credits). Only the TS layer checks ownership, and it isn't enforced by the DB.
- Team members (merchant_members role member/admin) can't use credits — all resolution is `owner_id`-only.

---

## 10. ANALYTICS

**12 event types:** product_view, page_view, ar_widget_visible, ar_launch, ar_session_end, add_to_cart, purchase_completed, buy_click, qr_open, embed_open, variant_switch, session_start.

**Ingestion:** `trackEvent` (embed.functions.ts, used by client `track.ts`) — derives merchant/business from the active product (anti cross-tenant injection), no client-supplied tenant IDs trusted. `collectEvents` (batch of 1-50) exists but is **dead code**. The embed.js widget itself sends NO events.

**Read side** (`src/lib/analytics.functions.ts`):
- `getAnalyticsSummary` — 30/7/1-day totals + byType
- `getMyAnalytics` — 14-day per-day {views, ar, buys} + recent 20
- `getConversionFunnel` — 6-stage funnel + conversion rate
- `getPerProductAnalytics` — per-product views/AR/buys/conversion (1-90 days)
- `getAttributionSummary` — session-level AR attribution (revenue influenced, avg AR session) — **dead code, unused by UI**
- `getRealTimeAnalytics` — last 15 min + active sessions

**UI** (`/analytics`): 4 tabs (Overview, Funnel, Products, Real-time) — fully wired with charts.

**DB:** `analytics_events` table + `attribution_sessions` table with a trigger `handle_event_attribution` that merges funnel flags per session (from migration 20260701000002).

---

## 11. DASHBOARD & ADMIN

**Dashboard** (`/dashboard` + `getDashboardSnapshot`): 5 fault-tolerant parallel reads (profile, merchant, 8 products, events 30d, 8 jobs); `isMissingTable()` swallows PGRST205/42P01 (missing tables never break dashboard); metrics = Total Views, AR Launches, Add to Cart, Revenue Influenced; sync status (needs-attention/syncing/up-to-date); onboarding nudge; verification card; dev utilities (demo workspace, simulate Shopify webhook, reset demo data — double-gated by NODE_ENV/ENABLE_DEVELOPER_TOOLS).

**Admin** (`/admin`, gated by `has_role('admin')` **client-side only**): job console with Start/Retry/Fail actions and status colors. No dead-letter UI, no user/billing management despite admin gating.

---

## 12. EMAIL SYSTEM

**Transport:** Resend (lazy singleton), FROM = `EMAIL_FROM` (currently `onboarding@resend.dev` test domain — emails restricted to verified recipient). `sendEmail` never throws, returns `{success, id|error}`.

**5 templates** (branded 480px cards): welcomeEmail, emailVerificationLink (24h), passwordResetEmail (1h), onboardingCompletedEmail, arModelReadyEmail.

**4 live flows:** signup verification (awaited), password reset (silent for unknown users), onboarding complete (fire-and-forget), model ready (fire-and-forget from webhook path). **`sendWelcomeEmail` is dead code.**

**Gaps:** no queue, no retry, no outbox — a Resend failure is silently dropped (console.error only) in fire-and-forget paths. Template HTML interpolates user names without escaping.

---

## 13. STORAGE & INFRASTRUCTURE

**Buckets:** `thumbnails` (10MB, jpeg/png/webp/gif) and `models` (100MB, glb/gltf/stl/obj/octet-stream), both PUBLIC (required for model-viewer). `ensureBuckets()` idempotent. Upload RLS: any authenticated user can INSERT; UPDATE/DELETE only own files; SELECT public.

**Helpers** (`storage.ts`): getSignedUrl(s) (3600s), uploadFile, transferRemoteFile (size-checked), deleteFile, listFiles, productAssetPath/thumbnailPath (dead), cors helpers.

**Upload server fns** (`upload.functions.ts`): `validateFileUpload` (**bug: uses createSignedUrl (download) instead of createSignedUploadUrl (upload)**), `verifyFileUpload` (no ownership check), `deleteUploadedFile` (**no ownership check**), `listUploadedFiles` (**no ownership scoping**), `generateUploadUrl` (correct upload-token API). MIME allowlists inconsistent across 4 files.

**Assets fns** (`assets.functions.ts`) — all mostly **stubs**: `optimizeModel` (returns original URL + recommendations, never writes asset_cache), `generateAssetVariants` (fabricates ?variant= URLs), `getSignedAssetUrl`, `getPreloadUrls` (hard-coded null thumbnail), `getCdnAssetUrl` (no real CDN). No auth middleware on any of them.

**Cache** (`cache.functions.ts`): in-memory Map, TTL 15-60s, substring invalidation. **Entire module is orphaned** — no route uses getCachedProducts/getCachedPublicProduct.

**Infrastructure:** logger (LOG_LEVEL), config getters (env-backed), `checkEnvironment()`, observability headers. `config.server.ts`: getServerConfig + validateEnv (only wired into npm run setup).

**Setup** (`npm run setup`): validateEnv → ensureBuckets → DB connectivity ping.

**server.ts** wires only 2 special routes: `/api/webhooks/shopify` and `/api/public/asset-meta`; everything else → TanStack SSR; h3-error normalization + rendered error pages (404/429/503/500).

---

## 14. DATABASE — 16 MIGRATIONS

1. `20260615123506` — foundation: roles, has_role, merchants, products, product_variants, analytics_events, processing_jobs, demo merchant + 3 demo products
2. `20260615123532` — touch_updated_at with search_path
3. `20260615123553` — analytics event_type length check
4. `20260627000000` — profiles, merchant_members, merchants.store_domain, get_user_merchant_id
5. `20260628000000` — marketplace_connections, external_catalog_items
6. `20260628000001` — credit system (merchant_credits, credit_transactions, deduct/add RPCs, 10-credit seed)
7. `20260629224044` — products.slug + unique index
8. `20260630000000` — security tables (used_nonces, audit_logs, asset_cache)
9. `20260630000001` — processing_jobs retry columns (retries, max_retries=5, next_retry_at, started_at, completed_at, result)
10. `20260701000000` — multi-tenant RLS rewrite (is_merchant_member)
11. `20260701000001` — webhook_events log
12. `20260701000002` — attribution_sessions + event trigger
13. `20260701000003` — business verification columns
14. `20260712000000` — PRODUCTION HARDENING: business_profiles, signup trigger, business_id columns + backfills, models table, store_integrations, webhook_logs, strict business_id RLS
15. `20260713000000` — fix seed_merchant_credits (SECURITY DEFINER)
16. `20260713000001` — storage RLS + credits backfill (10 credits for pre-existing merchants)

---

## 15. ENVIRONMENT VARIABLES

**In `.env.example`:** SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, APP_URL, WEBHOOK_BASE_URL, SHOPIFY_CLIENT_SECRET, SHOPIFY_API_KEY (unused in code), AMAZON_CLIENT_SECRET, DARAZ_CLIENT_SECRET, MESHY_API_KEY, MESHY_API_URL, TRIPO_API_KEY, TRIPO_API_URL, RESEND_API_KEY, EMAIL_FROM, NODE_ENV.

**Referenced by code but MISSING from .env.example:** SESSION_SECRET (falls back to service-role key for token encryption — insecure), SUPABASE_ANON_KEY (naming mismatch with SUPABASE_PUBLISHABLE_KEY → checkEnvironment always warns), SHOPIFY_WEBHOOK_SECRET, ENABLE_DEVELOPER_TOOLS / VITE_ENABLE_DEVELOPER_TOOLS, LOG_LEVEL, APP_VERSION, ALLOWED_ORIGINS, RATE_LIMIT_PUBLIC, RATE_LIMIT_AUTH, MAX_IMAGE_SIZE, MAX_MODEL_SIZE, UPLOAD_URL_EXPIRY, CDN_BASE_URL.

---

## 16. TESTS (8 files, all pass)

| File | Covers |
|---|---|
| ARViewer.test.tsx | model-viewer rendering, fallback, ios-src, AR attrs, ar-status callbacks (7 tests) |
| EmbedSnippet.test.tsx | global vs per-product snippets, copy button (8 tests) |
| auth.functions.test.ts | **duplicated** schema + error classifier (not the real handler) |
| credits.functions.test.ts | CREDIT_COSTS values + duplicated schemas |
| embed.functions.test.ts | duplicated embed script strings |
| error-capture.test.ts | AppError, withRetry, isRetryableError, createErrorBoundary |
| security.functions.test.ts | sanitizeHtml, rate limit store |
| utils.test.ts | slugify, cn |

**NOT tested:** products, marketplace, merchant, jobs, dashboard, analytics, upload, email, webhook handlers, worker, runner, routes, RLS. No integration or e2e tests.

---

## 17. COMPLETE BUG / STUB / DEAD-CODE INVENTORY

### 🔴 Critical
1. `deduct_credits` RPC broken SQL (`20260628000001_credit_system.sql:119-120`) — bigint→boolean cast error on every call; 7 callers mask as "Insufficient credits"
2. `add_credits`/`deduct_credits` EXECUTE granted to PUBLIC (SECURITY DEFINER) — credit minting/draining hole
3. Hardcoded live service-role + anon keys in `scripts/diag-deep.ts:3-5` and `scripts/diag-trigger.ts:4` — committed secrets, rotate immediately
4. Job input key mismatch: `input.image_url` (worker) vs `image_urls`/nothing (3 of 4 enqueue paths)
5. Meshy/Tripo webhook endpoints not mounted in server.ts → provider callbacks 404; no signature verification
6. Shopify webhook secrets unset in .env → `/api/webhooks/shopify` returns 503
7. Settings page broken: status "pending" violates CHECK, btoa token storage, WooCommerce unsupported, inert Manage button, always-null existingConnection

### 🟠 Important
8. No job reaper — worker crash wedges jobs in `processing` forever
9. Retries re-create + re-bill provider tasks (task_id never persisted); no jitter; no credit refund on failure
10. `requeueDeadLetterJob` always throws for actual dead letters
11. Stuck-job timeout doesn't kill the underlying fetch; `--cron` flag ignored
12. `validateFileUpload` uses createSignedUrl (download) instead of createSignedUploadUrl
13. No ownership checks on verifyFileUpload/deleteUploadedFile/listUploadedFiles
14. MIME allowlists inconsistent across storage.ts / upload.functions.ts / assets.functions.ts / ProductForm
15. Settings/marketplace create connections via 2 inconsistent paths (AES-GCM vs base64, active vs pending, business_id vs null)
16. `store_integrations` only backfilled at migration time — new connections never populate it → resolveBusinessId falls back to ilike
17. New connections don't mirror to store_integrations → Shopify webhook business resolution may miss them
18. Upsert product overwrites `image_url` with thumbnail_url on every edit
19. Embed readiness bug: product with direct models but no processing_jobs row reports ready:false (embed.functions path); models-table path (asset-meta) is OK
20. Og/canonical URLs are relative (`/p/slug`) instead of absolute
21. Amazon/Daraz webhook signature fail-open when secrets unset; handlers ack-only; merchantId null
22. Two parallel webhook audit systems (webhook_logs vs webhook_events)
23. Cross-tenant SKU collision risk via duplicate Shopify webhook path (`webhook-vendors` version)

### 🟡 Stubs / Missing features
24. All 3 vendor adapters mocked (return []) — no real SDKs
25. AI generation in ProductForm is a UI alert-stub (photos never uploaded)
26. assets.functions (optimizeModel, generateAssetVariants, getCdnAssetUrl) — stubs
27. No billing/credit purchase (pricing CTAs → /auth; Stripe not wired)
28. Admin page is jobs-console only; admin gate is client-side
29. Amazon/Daraz webhook full handling — TODO
30. No /scan route (QR points to Flutter deep link) — intentional but undocumented
31. `worker:cron` identical to `worker`; no single-shot mode
32. No dead-letter UI on admin page
33. `result` vs `output` dual columns on processing_jobs (schema drift)
34. Tripo jobs never produce real USDZ

### ⚪ Dead code
35. security.functions: validateInput, preventReplayAttack, auditLog, validateTenantAccess
36. jobs.functions: createProcessingJob, completeJob, requeueDeadLetterJob (broken)
37. analytics.functions: getMyJobs, getAttributionSummary
38. collect.functions: collectEvents (batched ingestion unused; embed.js sends no events)
39. cache.functions: entire module
40. email.functions: sendWelcomeEmail
41. merchant.functions: getMyMerchantId
42. credits.functions: deductForProcessingJob, deductForMarketplaceSync, ai_generation cost (nothing charges 2)
43. storage.ts: productAssetPath / thumbnailPath (form uses flat paths)
44. assets.functions: getPreloadUrls (never called)
45. `profile` legacy table used only as fallback in 2 places

### ⚪ Minor
46. Team members can't use credits (owner-only resolution)
47. Email enumeration leak on signup (reset path hides it)
48. No escaping of user names in email templates
49. Relative URLs: embed.js in getEmbedScript vs absolute in EmbedSnippet component
50. `SUPABASE_ANON_KEY` vs `SUPABASE_PUBLISHABLE_KEY` naming mismatch
51. workers/runner swallows uncaught exceptions (keep-alive tradeoff)
52. Docs drift: PRODUCT_FEATURE_GUIDE says 5s polling, actual 30s

---

## 18. RECOMMENDED NEXT STEPS (priority order)

**P0 — Fix blockers (do first):**
1. Fix `deduct_credits` SQL + REVOKE EXECUTE FROM PUBLIC + add owner checks inside RPCs
2. Fix job input keys (singular `image_url` on all enqueue paths)
3. Mount `/api/webhooks/meshy` + `/api/webhooks/tripo` in server.ts
4. Remove committed secrets from scripts/diag-*.ts; rotate keys
5. Set SHOPIFY_WEBHOOK_SECRET in .env

**P1 — Pipeline hardening:**
6. Job reaper for stuck `processing` jobs (started_at heartbeat)
7. Persist provider task_id; jitter; refund credits on permanent failure; fix dead-letter requeue
8. Fix settings page (real connection management, encrypt tokens, correct status)
9. Real Shopify pull adapter (Admin API) + decryptToken

**P2 — Features:**
10. Wire real AI generation in ProductForm
11. Credit purchase/billing
12. Amazon/Daraz webhook completion
13. Test coverage for server functions + worker
14. Absolute canonical/OG URLs, embed.js consistency

---
