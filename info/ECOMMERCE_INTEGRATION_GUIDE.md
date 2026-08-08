# E-Commerce Store Integration — Complete Guide

## How It Works (End-to-End Flow)

```
┌──────────────────────────────────────────────────────────────────┐
│                   STORE CONNECTION                                │
│                                                                   │
│  /marketplace → "Add marketplace connection"                      │
│    → createMarketplaceConnection()                                │
│      → Stores encrypted OAuth token in marketplace_connections    │
│                                                                   │
│  /settings → Shopify/Daraz/WooCommerce card                      │
│    → Direct insert into marketplace_connections                   │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                   PRODUCT SYNC (2 ways)                           │
│                                                                   │
│  WAY 1: Pull-based ("Sync now" button)                           │
│    /marketplace → "Sync now"                                     │
│    → syncExternalInventory() in marketplace.functions.ts         │
│    → Vendor adapter (Shopify/Daraz/Amazon)                       │
│    → Upserts into external_catalog_items                         │
│    ⚠️ NOTE: All 3 vendor adapters are MOCKED (return [])         │
│       Real SDK integration is marked as TODO                     │
│                                                                   │
│  WAY 2: Push-based (Shopify Webhook) ★ REAL IMPLEMENTATION       │
│    Shopify → POST /api/webhooks/shopify                         │
│    → server.ts routes to handleShopifyWebhookRequest()           │
│    → HMAC signature verified                                     │
│    → syncShopifyProduct() upserts directly into products table   │
│    → Auto-creates processing_job for 3D generation               │
│    → Can be tested via simulateShopifyWebhook() developer tool   │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                   CATALOG REVIEW (Pull-sync only)                 │
│                                                                   │
│  /marketpace → "Pending Catalog Items" section                  │
│    → Lists external_catalog_items with status="pending"          │
│    → Click "Approve" → approveCatalogItem()                      │
│      → Creates product in products table                         │
│      → Optionally creates processing_job for AI 3D generation    │
│    → Click "Reject" → rejectCatalogItem()                        │
│      → Marks item as rejected                                    │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                   3D GENERATION (Background)                      │
│                                                                   │
│  processing_jobs queued → job-worker.ts picks them up            │
│    → Calls Meshy or Tripo AI API                                 │
│    → Downloads generated GLB/USDZ/thumbnail                      │
│    → Uploads to Supabase Storage                                 │
│    → Updates product model_glb_url, model_usdz_url               │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                   PRODUCT DISPLAY                                 │
│                                                                   │
│  /products → List all products (authenticated)                   │
│  /products/$id → Edit product, see AR preview, embed snippet     │
│  /p/$slug → Public AR product page (anyone)                      │
│  /embed/$slug → Full-screen AR embed widget                      │
│                                                                   │
│  Embed on your storefront:                                       │
│    → getEmbedScript() → <script> tag                             │
│    → getPublicAssetMeta() resolves product by SKU or slug        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Current State of Each Integration

### Shopify — Webhook (Push) ★ READY TO TEST
| Component | Status | Location |
|-----------|--------|----------|
| HMAC signature verification | ✅ Done | `shopify-webhook.server.ts:43` |
| Product upsert logic | ✅ Done | `shopify-webhook.server.ts:101` |
| Processing job creation | ✅ Done | `shopify-webhook.server.ts:147` |
| Webhook audit logging | ✅ Done | `writeWebhookLog()` |
| Business resolution | ✅ Done | `resolveBusinessId()` |
| API endpoint | ✅ Done | `POST /api/webhooks/shopify` |
| Simulated testing tool | ✅ Done | `simulateShopifyWebhook()` in `developer-tools.functions.ts` |
| Real Shopify Admin API call (pull) | ❌ Mocked (returns []) | `fetchShopifyCatalog()` |
| `SHOPIFY_CLIENT_SECRET` env var | ⚠️ Not set in `.env` | Required for HMAC verification |

### Daraz — Webhook (Push) ⚠️ STUB ONLY
| Component | Status | Location |
|-----------|--------|----------|
| Signature validation | ⚠️ Stub | `webhook-vendors.functions.ts` |
| Event logging | ✅ Done | `logWebhookEvent()` |
| Product upsert | ✅ Done | `upsertProductFromWebhook()` |
| Real Daraz API call (pull) | ❌ Mocked (returns []) | `fetchDarazCatalog()` |
| `DARAZ_CLIENT_SECRET` env var | ⚠️ Not set in `.env` | Required for signature |

### Amazon — Webhook (Push) ⚠️ STUB ONLY
| Component | Status | Location |
|-----------|--------|----------|
| Signature validation | ⚠️ Stub | `webhook-vendors.functions.ts` |
| Event logging | ✅ Done | `logWebhookEvent()` |
| Product upsert | ✅ Done | `upsertProductFromWebhook()` |
| Real Amazon SP-API call (pull) | ❌ Mocked (returns []) | `fetchAmazonCatalog()` |
| `AMAZON_CLIENT_SECRET` env var | ⚠️ Not set in `.env` | Required for signature |

---

## 2. Ways to Test the Integration

### METHOD 1: Simulate Shopify Webhook (Quickest — No Shopify Store Needed)

A developer tool exists that simulates a Shopify `products/update` webhook and runs the full sync pipeline:

```typescript
// src/lib/developer-tools.functions.ts:108
simulateShopifyWebhook()
```

**What it does:**
1. Creates a fake Shopify product payload (title: "Shopify webhook demo product", price: $79.00)
2. Calls `syncShopifyProduct(userId, "products/update", payload)` directly
3. This runs the **real** sync logic:
   - Upserts into `products` table with `external_product_id` = simulated Shopify product ID
   - Creates a `processing_job` for 3D generation (queued, waiting for job worker)
   - No HMAC check needed (simulated bypasses it)

**How to test:**

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Sign in with `demo@gmail.com`

3. Call the simulation (via browser console or postman):
   ```
   POST http://localhost:3000/_server/fn/simulateShopifyWebhook
   Cookie: __session=<your_session_token>
   ```

4. Check results:
   - Go to `/products` — "Shopify webhook demo product" should appear in the list
   - Go to `/products/<id>` — see the synced product details
   - Check `processing_jobs` — a job should be queued for AI 3D generation

**Expected result:**
```json
{
  "ok": true,
  "result": {
    "product": { "id": "uuid", "title": "Shopify webhook demo product", "status": "active" },
    "job": { "id": "uuid", "status": "queued" }
  }
}
```

### METHOD 2: Connect + Sync (Pull-Based — End-to-End UI Flow)

This tests the full UI flow from connecting a store → syncing → reviewing → approving.

**Step-by-step:**

| Step | Action | What Happens Behind the Scenes |
|------|--------|-------------------------------|
| 1 | Sign in with `demo@gmail.com` | Session authenticated |
| 2 | Go to `/marketplace` | Loads connections page |
| 3 | In "Add marketplace connection" form, select **Shopify**, enter `https://test-store.myshopify.com`, click **Connect** | `createMarketplaceConnection()` inserts row in `marketplace_connections` with encrypted token |
| 4 | Connection appears in list. Click **Sync now** | `syncExternalInventory()` calls `fetchShopifyCatalog()` → **returns []** (mocked) |
| 5 | Check "Pending Catalog Items" | Shows 0 items (because no products were returned) |

**⚠️ Limitation:** Since all vendor adapters are mocked (return `[]`), the pull-based sync produces no catalog items. To see products flow through, use **Method 1** (simulated webhook) instead.

**To test the UI flow regardless of data:**
- The connection was created successfully (verify in `/settings`)
- The Sync button shows "Last sync" timestamp
- Create a product manually at `/products/new` then check it appears in `/products`

### METHOD 3: Manual Product Creation → Approve → Embed

If you just want to test the display side (products → AR viewer → embed), skip the store sync entirely:

| Step | Action |
|------|--------|
| 1 | Create product at `/products/new` |
| 2 | Fill title, price, upload thumbnail |
| 3 | Save → product appears at `/products` |
| 4 | Click product → edit page with AR preview |
| 5 | Copy embed snippet from edit page |
| 6 | Paste into any HTML page → AR viewer loads |
| 7 | Public page at `/p/<slug>` works for anyone |
| 8 | Embed page at `/embed/<slug>` shows full-screen AR |

### METHOD 4: Load Demo Data (5–10 Products)

```bash
POST http://localhost:3000/_server/fn/generateDemoWorkspace
Cookie: __session=<your_session_token>
```

Creates 5–10 products with analytics events. Disabled in production by default.

---

## 3. Database Tables Involved

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `marketplace_connections` | Store connection credentials | `id`, `business_id`, `merchant_id`, `platform` (shopify/daraz/amazon), `store_url`, `oauth_token_hash`, `status`, `last_sync_at` |
| `store_integrations` | Secondary integration store | `id`, `business_id`, `platform`, `store_url`, `external_store_id`, `status` |
| `external_catalog_items` | Pull-synced products awaiting review | `id`, `connection_id`, `external_sku`, `title`, `price_cents`, `image_urls[]`, `status` (unprocessed/approved/rejected/synced), `mapped_product_id` |
| `products` | Final product records | `id`, `merchant_id`, `business_id`, `slug`, `title`, `price_cents`, `model_glb_url`, `model_usdz_url`, `thumbnail_url`, `external_sku`, `external_product_id`, `status` |
| `webhook_events` | Incoming webhook audit log | `id`, `merchant_id`, `platform`, `event_type`, `topic`, `verified`, `processed` |
| `webhook_logs` | Shopify webhook-specific log | `id`, `business_id`, `platform`, `topic`, `signature_valid`, `processed_at` |
| `processing_jobs` | 3D generation job queue | `id`, `product_id`, `provider` (meshy/tripo), `status` (queued/processing/ready/failed) |

---

## 4. Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/marketplace.functions.ts` | Connect store, sync, approve/reject catalog items |
| `src/lib/shopify-webhook.server.ts` | Shopify webhook handler with HMAC verification |
| `src/lib/webhook-vendors.functions.ts` | Shopify/Daraz/Amazon webhook stubs + shared upsert logic |
| `src/lib/developer-tools.functions.ts` | `simulateShopifyWebhook()`, `generateDemoWorkspace()` |
| `src/lib/products.functions.ts` | Product CRUD + public queries |
| `src/lib/embed.functions.ts` | Embed script generation, public asset metadata |
| `src/lib/storage.ts` | File upload helpers for product assets |
| `src/routes/_authenticated/marketplace.tsx` | Marketplace UI (connections + catalog review) |
| `src/routes/_authenticated/settings.tsx` | Settings UI (platform connection cards) |
| `src/routes/_authenticated/products.tsx` | Product list UI |
| `src/routes/_authenticated/products.new.tsx` | New product form UI |
| `src/routes/_authenticated/products.$id.tsx` | Product edit UI |
| `src/routes/p.$slug.tsx` | Public AR product page |
| `src/routes/embed.$slug.tsx` | Full-screen embed page |
| `src/workers/job-worker.ts` | Background 3D generation worker |
| `src/components/ARViewer.tsx` | 3D model viewer component |
| `src/components/EmbedSnippet.tsx` | Embed code display component |
| `src/server.ts` | Webhook endpoint routing (`POST /api/webhooks/shopify`) |

---

## 5. Required Environment Variables

```bash
# For Shopify webhook HMAC verification (required for production webhook)
SHOPIFY_CLIENT_SECRET=your_shopify_client_secret

# For Amazon/Daraz webhooks (required for production)
AMAZON_CLIENT_SECRET=your_amazon_client_secret
DARAZ_CLIENT_SECRET=your_daraz_client_secret

# Webhook base URL (where Shopify sends callbacks)
WEBHOOK_BASE_URL=http://localhost:3000

# AI Provider keys (for 3D model generation from synced products)
MESHY_API_KEY=your_key_here
TRIPO_API_KEY=your_key_here
```

---

## 6. Quick Test Checklist

```
□ Start dev server: npm run dev

□ METHOD 1: Simulate Shopify Webhook
  □ Sign in with demo@gmail.com
  □ Call simulateShopifyWebhook() (browser console or Postman)
  □ Go to /products — "Shopify webhook demo product" appears
  □ Click product — edit page shows with processing job queued

□ METHOD 2: Connect + Pull Sync (UI Flow)
  □ Go to /marketplace
  □ Connect a store (Shopify, enter any URL)
  □ Connection appears in list with "Active" status
  □ Click "Sync now" (returns 0 items — adapters are mocked)
  □ Verify "Last sync" timestamp updated

□ METHOD 3: Manual Product
  □ Create product at /products/new
  □ Verify it appears in /products list
  □ View public page at /p/<slug>
  □ Check embed page at /embed/<slug>

□ METHOD 4: Demo Data
  □ Call generateDemoWorkspace()
  □ 5–10 products appear in /products
  □ Each has AR availability status
```

---

## 7. Next Steps to Make Production-Ready

- Implement real vendor API adapters (`fetchShopifyCatalog`, `fetchDarazCatalog`, `fetchAmazonCatalog`) using official SDKs
- Set `SHOPIFY_CLIENT_SECRET`, `AMAZON_CLIENT_SECRET`, `DARAZ_CLIENT_SECRET` in `.env`
- Deploy `job-worker.ts` as a background process or cron job
- Set up proper Shopify webhook registration (point Shopify to `/api/webhooks/shopify`)
- Configure `WEBHOOK_BASE_URL` to your production domain
