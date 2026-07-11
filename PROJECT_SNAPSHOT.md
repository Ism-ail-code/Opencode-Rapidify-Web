# Rapidify — AR Commerce Suite

A full-stack multi-tenant SaaS platform for merchants to create AR product pages, generate 3D models from photos via AI, sync inventory from marketplaces (Daraz/Amazon/Shopify), and embed AR viewers on any website.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TanStack Start (SSR) + TanStack Router + TanStack Query |
| **Language** | TypeScript (strict) |
| **Styling** | Tailwind CSS v4 + shadcn/ui + Radix Primitives |
| **Database** | Supabase (PostgreSQL) with Row-Level Security |
| **Storage** | Supabase Storage (models, thumbnails) |
| **AI** | Meshy API + Tripo3D API (image-to-3D) |
| **Charts** | Recharts |
| **Forms** | react-hook-form + Zod validation |
| **Runner** | Standalone Node.js worker (`tsx`) |
| **Build** | Vite 7 + Nitro (Cloudflare-compatible) |
| **Package** | Bun + npm lockfile |

---

## Route Map (16 routes)

| Path | Type | Description |
|------|------|-------------|
| `/` | Public | Landing page (hero, features, pricing with toggle, FAQ accordion) |
| `/auth` | Auth | Sign in / Sign up (email + Google OAuth, forgot password) |
| `/auth/callback` | Auth | OAuth callback handler |
| `/auth/onboarding` | Auth | New merchant setup (profile + merchant creation) |
| `/auth/update-password` | Auth | Password reset form |
| `/p/$slug` | Public | Public AR product page with `<model-viewer>` + Quick Look / Scene Viewer |
| `/embed/$slug` | Public | Embeddable AR viewer (for iframe embeds) |
| `/dashboard` | Protected | Merchant dashboard (stats, recent products, recent views, jobs chart) |
| `/products` | Protected | Product listing with search, status filter, batch actions |
| `/products/new` | Protected | New product form (QR code for LiDAR, AI 2D-to-3D, direct upload) |
| `/products/$id` | Protected | Edit product (details + embed code snippet + processing jobs card) |
| `/analytics` | Protected | Analytics dashboard (overview, conversion funnel, per-product, realtime) |
| `/marketplace` | Protected | Marketplace connections (Daraz, Amazon, Shopify) + catalog review |
| `/settings` | Protected | Settings page (reconnect marketplace, manage connections) |
| `/admin` | Protected | Admin pipeline (processing job queue management) |

---

## Features Implemented

### Authentication & Onboarding
- Email/password auth + Google OAuth
- Forgot/reset password flow
- Email verification gate with pending screen
- Merchant onboarding (profile + merchant + owner membership)
- Session guard on protected routes

### Product Management
- Full CRUD with slug-based URLs
- ProductForm with two 3D creation paths:
  - **Option A (Studio Capture)**: QR code for mobile LiDAR handoff, separate GLB + USDZ drag-drop upload zones
  - **Option B (AI Generation)**: Multi-angle photo upload (3-5), triggers Meshy/Tripo API jobs
- Fallback thumbnail upload
- Variants support

### 3D Model Pipeline
- Background worker (`workers/runner.ts` + `job-worker.ts`) polls for queued jobs
- Supports Meshy and Tripo AI providers
- Exponential backoff retry (max 5 retries)
- Direct upload bypasses queue (LiDAR/Camera capture)
- `finalizeDirectUpload()` for Flutter app handoff

### AR Embed System
- Public product pages at `/p/$slug` with `<model-viewer>` WebXR
- Embeddable `<script>` tag for third-party sites (data-attribute-based)
- Copy-to-clipboard embed snippet widget in product edit page
- QR code for mobile-to-desktop AR sharing
- `embed.js` client-side script in `/public`

### Marketplace Integration (Multi-Vendor)
- Connections: Daraz, Amazon, Shopify
- Token encryption (AES-GCM) via Web Crypto
- Inventory sync into `external_catalog_items`
- Approve/reject workflow
- Auto-create products + processing jobs on approval

### Credit / Wallet System
- Per-merchant credit balance (10 free credits on signup)
- Atomic deduction via PostgreSQL RPC (`deduct_credits`)
- Costs: processing_job=1, marketplace_sync=1, ai_generation=2
- Dashboard sidebar displays balance
- Immutable credit transaction ledger

### Analytics Suite
- Tracks: product_view, ar_launch, buy_click, qr_open, embed_open, variant_switch, session_start
- 14-day trend charts, conversion funnel, per-product analytics
- Real-time activity (last 15 minutes)
- Server-side event ingestion with validation

### Security Hardening
- Rate limiting (30/min public, 200/min auth) via TanStack middleware
- Nonce-based replay attack prevention (`used_nonces` table)
- Audit logging of security events (`audit_logs` table)
- Webhook signature verification (HMAC-SHA256)
- Input validation & sanitization
- Tenant access validation (merchant-owned resources only)
- Asset cache table

### Infrastructure
- In-memory cache with TTL (30s products, 15s single product)
- Error boundary at root + route-level (`RouteErrorBoundary`)
- SSR error page renderer (404, 429, 503, 500)
- Graceful worker shutdown (SIGINT/SIGTERM)
- Circuit breaker (backoff after 10 consecutive failures)
- Retry wrapper (exponential backoff with jitter, max 3 attempts)

---

## Database Schema (15 tables)

| Table | Purpose |
|-------|---------|
| `user_roles` | RBAC (admin, merchant) |
| `profiles` | User profile data |
| `merchants` | Multi-tenant merchant accounts |
| `merchant_members` | Role-based merchant membership |
| `products` | AR product catalog |
| `product_variants` | Variants (color, model per variant) |
| `analytics_events` | Event tracking |
| `processing_jobs` | 3D generation job queue |
| `marketplace_connections` | Vendor OAuth connections |
| `external_catalog_items` | Synced marketplace products |
| `merchant_credits` | Credit balance |
| `credit_transactions` | Immutable ledger |
| `used_nonces` | Replay prevention |
| `audit_logs` | Security audit trail |
| `asset_cache` | Cached asset metadata |

---

## Architecture Overview

```
[Browser] <-> TanStack Start SSR (Vite + Nitro)
                |
                ├── Server Functions (RPC-style, no REST)
                │   ├── products / analytics / credits / marketplace / jobs
                │   ├── attachSupabaseAuth middleware
                │   ├── rateLimitMiddleware
                │   └── errorMiddleware
                │
                ├── Supabase
                │   ├── PostgreSQL (RLS-protected)
                │   ├── Storage (models, thumbnails)
                │   └── Auth (email + OAuth)
                │
                └── Worker (standalone process)
                    ├── Polls `processing_jobs` queue
                    ├── Calls Meshy / Tripo AI APIs
                    ├── Downloads to Supabase Storage
                    └── Updates product + job status
```

---

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite dev` | Development server |
| `build` | `vite build` | Production build |
| `preview` | `vite preview` | Preview production build |
| `lint` | `eslint .` | Lint all files |
| `format` | `prettier --write .` | Format all files |
| `worker` | `npx tsx src/workers/runner.ts` | Run background worker |
| `worker:dev` | `npx tsx watch src/workers/runner.ts` | Dev mode worker |
| `worker:cron` | `npx tsx src/workers/runner.ts --cron` | Cron mode worker |
| `setup` | `npx tsx src/lib/setup.ts` | One-time infra setup |

---

## Directory Structure

```
├── public/                        # Static assets (embed.js, robots.txt)
├── src/
│   ├── components/                # React components
│   │   ├── ui/                    # shadcn/ui primitives (~40 files)
│   │   ├── ARViewer.tsx           # <model-viewer> wrapper
│   │   ├── DashboardShell.tsx     # Authenticated layout sidebar
│   │   ├── EmbedSnippet.tsx       # Embed code copy widget
│   │   ├── ProductForm.tsx        # Product creation/edit form
│   │   ├── QRModal.tsx            # QR code modal
│   │   ├── RouteErrorBoundary.tsx # Route-level error boundary
│   │   └── SiteHeader.tsx         # Public site header
│   ├── hooks/
│   │   ├── use-theme.tsx          # Dark/light theme
│   │   └── use-mobile.tsx         # Mobile detection
│   ├── integrations/supabase/     # Supabase client, auth, types
│   ├── lib/                       # Server functions & utilities
│   │   ├── analytics.functions.ts # Analytics queries
│   │   ├── assets.functions.ts    # Asset optimization & CDN
│   │   ├── cache.functions.ts     # In-memory TTL cache
│   │   ├── credits.functions.ts   # Credit wallet operations
│   │   ├── embed.functions.ts     # Embed script generation
│   │   ├── error-capture.ts       # Retry logic & error helpers
│   │   ├── error-page.ts          # SSR error page renderer
│   │   ├── jobs.functions.ts      # Processing job lifecycle
│   │   ├── marketplace.functions.ts # Marketplace ingestion
│   │   ├── merchant.functions.ts  # Merchant onboarding
│   │   ├── products.functions.ts  # Product CRUD
│   │   ├── security.functions.ts  # Rate limiting, validation, audit
│   │   ├── upload.functions.ts    # File upload signed URLs
│   │   └── webhooks.functions.ts  # Meshy + Tripo webhooks
│   ├── routes/                    # TanStack file-based routes
│   └── workers/
│       ├── runner.ts              # Worker main loop
│       └── job-worker.ts          # AI job processing
├── supabase/migrations/           # 10 migration files
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side admin key |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Client-side anon key |
| `VITE_SUPABASE_URL` | Yes | Public Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Public anon key |
| `APP_URL` | Yes | Deployment URL for webhooks |
| `MESHY_API_KEY` | No | Meshy AI API key |
| `TRIPO_API_KEY` | No | Tripo3D API key |
