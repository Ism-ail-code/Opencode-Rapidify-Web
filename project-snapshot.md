# AR Commerce Suite — Project Snapshot

**Date**: July 12, 2026

---

## Today's Work Summary

### 1. Dev Bypass — One-Click Onboarding
- **Problem**: Onboarding form was required every time; no way to skip for demo/development
- **Solution**: Created `devQuickSetup` server function in `src/lib/merchant.functions.ts`
  - Uses `supabaseAdmin.auth.admin.updateUserById()` to set `app_metadata.onboarding_completed_at`
  - Falls back gracefully when `business_profiles` / `profiles` tables don't exist
  - Silently tries to create merchant + merchant_members + store_integrations (non-blocking)
- **UI**: Blue "Quick Demo Setup" button on `/auth/onboarding`, gated behind `import.meta.env.DEV || VITE_ENABLE_DEVELOPER_TOOLS`
- **Session fix**: After dev bypass succeeds, `supabase.auth.refreshSession()` is called before navigating to dashboard (ensures route guard sees fresh metadata)

### 2. Route Guard — `app_metadata` Fallback
- **Files modified**:
  - `src/routes/_authenticated/route.tsx` — checks `session.user.app_metadata?.onboarding_completed_at` first
  - `src/routes/auth.onboarding.tsx` — same fallback in `beforeLoad`
- **Why**: Auth tables always exist; no custom DB tables needed for the bypass to work

### 3. Dashboard — Silent Table-Not-Found Errors
- **File**: `src/lib/dashboard.functions.ts`
- **Problem**: Dashboard showed 5 "could not be refreshed" toast errors when querying non-existent tables (`business_profiles`, `merchants`, `products`, `analytics_events`, `processing_jobs`)
- **Fix**: Added `isMissingTable()` check — suppresses warnings for PGRST205 / 42P01 errors

### 4. Database Migrations Applied
- **Problem**: No custom tables existed in Supabase project — every page failed
- **Action**: Created `scripts/run-migrations.ts` to execute SQL via Supabase API, but `/sql` endpoint was unavailable
- **Workaround**: User manually ran all 14 migration files in Supabase Dashboard SQL Editor
- **Issue encountered**: Foreign key type mismatch (`uuid` vs `text`) on `external_catalog_items_mapped_product_id_fkey`
- **Fix**: Dropped and recreated public schema, then re-ran all migrations fresh
- **Result**: All 14 migrations applied successfully

### 5. Developer Tools — Auto-Create Merchant
- **File**: `src/lib/developer-tools.functions.ts`
- **Problem**: "Generate 5-10 demo products" button failed because `devQuickSetup` ran before migrations existed, so no `merchants` row was created
- **Fix**: `getMerchant()` helper now auto-creates a merchant row if none exists (instead of throwing)
- **Status**: Change applied, user to verify next session

### 6. Error Visibility — Dashboard Dev Tools
- **File**: `src/routes/_authenticated/dashboard.tsx`
- **Problem**: Dev utility errors showed only a generic message
- **Fix**: Changed error display to show actual `Error.message` string

---

## Current State

### Working ✅
- Sign-up / sign-in via Supabase auth
- Landing page (`/`)
- Quick Demo Setup → redirects to dashboard
- Dashboard renders without toast errors
- Route guards check `app_metadata` first (works without DB tables)
- All 14 database migrations applied
- `merchants`, `products`, `business_profiles`, `profiles`, `analytics_events`, `processing_jobs`, and 21 other tables exist

### Not Yet Tested / Remaining ❓
- "Generate 5-10 demo products" button — fix applied, needs testing
- Product CRUD (`/products/new`, `/products/:id`)
- Analytics pages
- Marketplace connections
- Public product page (`/p/:slug`)
- Embed page (`/embed/:slug`)
- Webhook handlers (Shopify, Meshy, Tripo)
- Credit system

### Known Bug 🐛
- None currently open

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/merchant.functions.ts` | `devQuickSetup` + `completeOnboarding` |
| `src/lib/dashboard.functions.ts` | `getDashboardSnapshot` with missing-table tolerance |
| `src/lib/developer-tools.functions.ts` | `getMerchant` with auto-create, `generateDemoWorkspace` |
| `src/routes/_authenticated/route.tsx` | Auth guard with `app_metadata` fallback |
| `src/routes/auth.onboarding.tsx` | Onboarding page + demo button + `beforeLoad` guard |
| `src/routes/_authenticated/dashboard.tsx` | Dashboard with dev tool error display |
| `scripts/run-migrations.ts` | Migration runner (has fallback paths for different SQL API endpoints) |
| `supabase/migrations/*.sql` | 14 database migration files |

---

## Quick Reference — Dev Server
```bash
npm run dev          # Start dev server
npx tsx scripts/run-migrations.ts   # Run migrations (if needed)
npm run setup        # Verify env + storage buckets
npm run lint         # ESLint
npx tsc --noEmit     # Type check
```

## Next Session
1. Restart dev server
2. Click "Generate 5-10 demo products" — report any errors shown
3. Test product CRUD at `/products/new`
4. Test public product page at `/p/{slug}`
5. Browse analytics at `/analytics`
