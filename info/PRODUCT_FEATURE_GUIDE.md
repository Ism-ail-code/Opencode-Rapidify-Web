# Product Feature — Fetch & Display Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                          │
│                                                              │
│  /products          → Product list (authenticated)            │
│  /products/new      → Create product (authenticated)          │
│  /products/$id      → Edit product (authenticated)            │
│  /p/$slug           → Public AR product page (anyone)         │
│  /embed/$slug       → Embed widget (headless)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ useServerFn()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Server Functions (src/lib/)                     │
│                                                              │
│  products.functions.ts  → CRUD + query functions              │
│  cache.functions.ts     → In-memory cached queries            │
│  embed.functions.ts     → Embed script generation             │
│  storage.ts             → File upload helpers                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ supabaseAdmin
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                     │
│                                                              │
│  Table: public.products                                      │
│  Buckets: models/, thumbnails/                               │
│  Jobs: processing_jobs (AI 3D generation)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Database Schema (Products)

### Table: `public.products`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | `uuid` | `gen_random_uuid()` | Primary Key |
| `merchant_id` | `uuid` | — | FK → merchants(id) ON DELETE CASCADE |
| `business_id` | `uuid` | `null` | FK → auth.users(id) (nullable) |
| `slug` | `text` | — | UNIQUE, used in URLs /p/:slug |
| `title` | `text` | — | Product name |
| `description` | `text` | `null` | Markdown or plain text |
| `price_cents` | `integer` | `0` | Price in cents ($9.99 = 999) |
| `currency` | `text` | `'USD'` | ISO 4217 |
| `thumbnail_url` | `text` | `null` | Product image URL |
| `image_url` | `text` | `null` | Full size image |
| `model_glb_url` | `text` | `null` | 3D model (GLB format) |
| `model_usdz_url` | `text` | `null` | 3D model (USDZ for iOS) |
| `external_product_id` | `text` | `null` | Vendor product ID |
| `external_sku` | `text` | `null` | Vendor SKU |
| `buy_url` | `text` | `null` | External purchase URL |
| `status` | `enum` | `'active'` | `draft`, `active`, `archived` |
| `created_at` | `timestamptz` | `now()` | Auto |
| `updated_at` | `timestamptz` | `now()` | Auto (trigger) |

### Related Tables

| Table | Purpose |
|-------|---------|
| `product_variants` | Color/SKU variants per product (GLB/USDZ per variant) |
| `models` | AI-generated 3D models linked to products |
| `processing_jobs` | Background AI generation job queue |
| `analytics_events` | Product view, AR launch, buy click events |

---

## 2. How to Fetch Products

### A. Public Product Page (`/p/:slug`)

**Function**: `getPublicProduct({ slug })` in `src/lib/products.functions.ts`

Fetches a single **active** product by slug with merchant and variant data.

**Usage**: Navigate to `http://localhost:3000/p/ar-astronaut`

This uses the 3 demo products seeded in the database:
- `ar-astronaut` — Space Explorer AR Helmet
- `ar-helmet` — Cyberpunk AR Helmet
- `ar-horse` — 3D AR Horse Model

**How to test**:
1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000/p/ar-astronaut`
3. You should see:
   - Product title, description, price
   - 3D AR viewer with `<model-viewer>`
   - Buy button, share/QR options
   - Product variants (if any)

### B. Public Product Listing (Featured)

**Function**: `listFeaturedProducts()` in `src/lib/products.functions.ts`

Returns up to 12 **active** products across all merchants.

**Usage**: Call from any server function:
```typescript
import { listFeaturedProducts } from "@/lib/products.functions";
const products = await listFeaturedProducts();
```

### C. Authenticated Product List (`/products`)

**Function**: `listMyProducts()` in `src/lib/products.functions.ts`

Returns all products for the current user's `business_id`.

**Route**: `http://localhost:3000/products` (requires sign-in)

**How to test**:
1. Sign in with `demo@gmail.com`
2. Navigate to `http://localhost:3000/products`
3. You should see a table with:
   - Product name (linked to edit page)
   - SKU
   - Status badge (Draft / Active / Archived)
   - AR availability indicator
   - Price
   - Last updated date
4. If no products exist, an empty state is shown with:
   - "Add Product" button → `/products/new`
   - "Sync from Shopify" button
   - "Load Demo Data" button

### D. Single Product for Editing (`/products/:id`)

**Function**: `getMyProduct({ id })` in `src/lib/products.functions.ts`

Returns a single product by ID, only if it belongs to the current user.

---

## 3. How to Create Products

### Via UI Form (`/products/new`)

1. Sign in to `http://localhost:3000`
2. Navigate to `http://localhost:3000/products/new`
3. Fill in:
   - **Title** (required)
   - **Slug** (auto-generated from title, can edit)
   - **Description**
   - **Price** (in dollars, converted to cents)
   - **Currency**
   - **Buy URL** (external purchase link)
   - **Status** (Draft / Active)
4. Add images/models via:
   - **Option A: Direct Upload** — Upload GLB/USDZ files directly
   - **Option B: AI Generation** — Upload thumbnail + multi-angle photos (3–5)
5. Click "Save Product"

**Server function**: `upsertProduct(data)` handles:
- Upserts into `products` table
- If AI generation requested: deducts credits, queues `processing_job`
- If direct models uploaded: product goes live immediately

### Via Shopify Webhook (Automatic)

When a Shopify store is connected, products sync automatically via:
- `shopify-webhook.server.ts` → `syncShopifyProduct()`
- Triggered by Shopify's `products/create` and `products/update` webhooks

### Via Demo Data

1. Sign in and go to `/products`
2. Click "Load Demo Data"
3. Calls `insertDemoProduct()` in `developer-tools.functions.ts`
4. Creates 5–10 demo products with analytics events

---

## 4. How 3D Models Work

### Three Sources of 3D Models

| Source | Flow | Time |
|--------|------|------|
| **Direct Upload** | Upload GLB/USDZ files → stored in Supabase storage `models/` bucket → URL saved to product | Instant |
| **AI Generation** | Upload photos → `upsertProduct` queues `processing_job` → `job-worker.ts` calls Meshy/Tripo API → webhook delivers model → product updated with URLs | 5–30 min |
| **Mobile LiDAR** | Flutter app scans → `finalizeDirectUpload()` uploads GLB → product goes live | Instant |

### AI Generation Pipeline

```
User uploads photos
       │
       ▼
upsertProduct()
  - Deducts credit (1 per generation)
  - Inserts processing_job (status: queued)
       │
       ▼
job-worker.ts (polling every 5s)
  - Picks up queued jobs
  - Calls Meshy or Tripo API
  - Waits for completion (polling)
  - Downloads generated model files
  - Uploads to Supabase Storage
  - Updates product with model URLs
  - Sends email notification
       │
       ▼
Product page shows 3D model
```

---

## 5. How to Test Everything

### Prerequisites
```bash
npm install
npm run dev
```

### Test Flow 1: View Public Products

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `http://localhost:3000/p/ar-astronaut` | Product page loads with title, price, AR viewer |
| 2 | Click the 3D viewer | model-viewer loads the GLB file |
| 3 | Click "Buy Now" | Navigates to buy_url (if set) |
| 4 | Click Share | QR modal opens with product URL |
| 5 | Open `http://localhost:3000/p/ar-helmet` | Different product loads correctly |
| 6 | Open `http://localhost:3000/p/nonexistent` | 404 or error state shown |

### Test Flow 2: Authenticated Product Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign in with `demo@gmail.com` | Redirected to dashboard |
| 2 | Navigate to `/products` | Product list page with table |
| 3 | Click "Add Product" | Navigate to `/products/new` |
| 4 | Fill title "Test Product", price "19.99" | Form fields populate |
| 5 | Click "Save Product" | Product created, redirected to `/products/$id` |
| 6 | On edit page, modify title | Changes saved |
| 7 | Click "Delete" | Confirmation dialog |
| 8 | Confirm delete | Product removed, redirected to `/products` |

### Test Flow 3: Product with Direct 3D Upload

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to `/products/new` | Form loads |
| 2 | Fill title, price | Fields populated |
| 3 | Under "3D Capture & Direct Upload", select a GLB file | File uploads to storage |
| 4 | Click "Save Product" | Product created with model URL |
| 5 | Navigate to public page `/p/{slug}` | AR viewer shows uploaded model |

### Test Flow 4: Product with AI 3D Generation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to `/products/new` | Form loads |
| 2 | Fill title, price | Fields populated |
| 3 | Under "AI 2D-to-3D Generation", upload thumbnail | Thumbnail uploads |
| 4 | Upload 3–5 multi-angle photos | Photos upload to storage |
| 5 | Click "Save Product" | Product created, processing_job queued |
| 6 | Navigate to `/products/$id` | Processing job status shown |
| 7 | Wait 5–30 min | Model generation completes |
| 8 | Refresh page | 3D model URLs populated, AR viewer works |

### Test Flow 5: Public Embed

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `http://localhost:3000/embed/ar-astronaut` | Full-screen AR viewer loads |
| 2 | Resize browser window | Viewer is responsive |
| 3 | Check browser console | No errors |

---

## 6. Key Server Functions Reference

### `src/lib/products.functions.ts`

| Function | Input | Output | Auth |
|----------|-------|--------|------|
| `getPublicProduct` | `{ slug: string }` | Product with merchant + variants | Public |
| `listFeaturedProducts` | none | Product[] (max 12, active only) | Public |
| `listMyProducts` | none | Product[] (by business_id) | Auth |
| `getMyProduct` | `{ id: string }` | Single product | Auth (owner) |
| `upsertProduct` | `ProductInput` | Created/updated product | Auth |
| `deleteProduct` | `{ id: string }` | Success | Auth (owner) |
| `getMobileARAsset` | `{ productId: string }` | MobileARAsset payload | Auth |
| `finalizeDirectUpload` | `{ productId, glbUrl, usdzUrl }` | Updated product | Auth |

### `src/lib/cache.functions.ts`

| Function | Description |
|----------|-------------|
| `getCachedProducts()` | Cached list of active products (memory cache) |
| `getCachedPublicProduct({ slug })` | Cached single product lookup |
| `invalidateProductCache()` | Clear cache after mutation |
| `prefetchProducts()` | Prefetch product IDs |

---

## 7. Testing API Directly (No Browser)

### Fetch Featured Products (Public)
```bash
curl http://localhost:3000/api/listFeaturedProducts
```

### Fetch Public Product by Slug
```bash
curl http://localhost:3000/api/getPublicProduct?slug=ar-astronaut
```

### Create Product (Authenticated)
Replace `SESSION_TOKEN` with actual session cookie:
```bash
curl -X POST http://localhost:3000/api/upsertProduct \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=SESSION_TOKEN" \
  -d '{"title":"Test","slug":"test-product","price_cents":1999,"currency":"USD","status":"active"}'
```

---

## 8. Common Issues & Debugging

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Product page shows 404 | Slug doesn't exist or product is not `active` | Check DB: `SELECT * FROM products WHERE slug='...'` |
| AR viewer blank/error | `model_glb_url` is null or file not accessible | Upload GLB or wait for AI generation to complete |
| "No Products" on dashboard | User's `business_id` has no products | Add demo data or create a product |
| AI generation stuck at "queued" | Job worker not running | Start worker: `npm run job-worker` or check logs |
| Price shows 0 | `price_cents` is 0 | Update product with correct price in cents |
| File upload fails | Supabase storage bucket not created | Verify `models` and `thumbnails` buckets exist |
| Embed not working | Product not found by SKU or slug | Verify SKU/slug is correct in embed code |

---

## 9. Quick Test Checklist

```
□ Start dev server: npm run dev
□ Visit /p/ar-astronaut — product page loads with AR viewer
□ Visit /p/ar-helmet — different product loads
□ Sign in with demo@gmail.com
□ Visit /products — product list with table
□ Click "Add Product" — form loads
□ Create a product — product appears in list
□ Edit the product — changes save
□ Delete the product — product removed
□ Load demo data — 5-10 products created
□ Visit /embed/ar-astronaut — full screen AR viewer
```

---

## 10. Environment Variables Required

```
# Already set:
SUPABASE_URL=https://okoloionftfxyvscfvhh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# For AI 3D generation (optional):
MESHY_API_KEY=your_key_here        # https://platform.meshy.ai
TRIPO_API_KEY=your_key_here        # https://platform.tripo3d.ai

# For email notifications (optional):
RESEND_API_KEY=re_...              # For "model ready" emails
```
