import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_COSTS } from "@/lib/credits.functions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VendorProduct {
  sku: string;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  image_urls: string[];
}

// ---------------------------------------------------------------------------
// Mock vendor API adapters (replace with real SDK integrations later)
// ---------------------------------------------------------------------------

async function fetchDarazCatalog(_tokenHash: string, _storeUrl: string): Promise<VendorProduct[]> {
  // TODO: Replace with real Daraz Open Platform SDK call
  // https://seller.daraz.pk/doc/api/listing/item/list
  return [];
}

async function fetchAmazonCatalog(_tokenHash: string, _storeUrl: string): Promise<VendorProduct[]> {
  // TODO: Replace with real Amazon SP-API call
  // https://developer-docs.amazon.com/sp-api/docs/catalog-items-api-v2022-04-01-reference
  return [];
}

async function fetchShopifyCatalog(_tokenHash: string, _storeUrl: string): Promise<VendorProduct[]> {
  // TODO: Replace with real Shopify Admin API call
  // https://shopify.dev/docs/api/admin-rest/2023-10/resources/product
  return [];
}

const VENDOR_ADAPTERS: Record<string, typeof fetchDarazCatalog> = {
  daraz: fetchDarazCatalog,
  amazon: fetchAmazonCatalog,
  shopify: fetchShopifyCatalog,
};

// ---------------------------------------------------------------------------
// Server Functions
// ---------------------------------------------------------------------------

export const listMarketplaceConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Resolve merchant_id first
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return [];

    const { data, error } = await context.supabase
      .from("marketplace_connections")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createMarketplaceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    vendor: z.enum(["daraz", "amazon", "shopify"]),
    store_url: z.string().min(1).max(500),
    access_token: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Resolve merchant_id from authenticated user
    const { data: merchant, error: mErr } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (mErr || !merchant) throw new Error("No merchant profile found. Complete onboarding first.");

    const { error } = await context.supabase.from("marketplace_connections").insert({
      merchant_id: merchant.id,
      platform: data.vendor,
      store_url: data.store_url,
      oauth_token_hash: data.access_token,
      status: "active",
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteMarketplaceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("marketplace_connections").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Core catalog ingestion worker.
 * Connects to the merchant's external marketplace, pulls active inventory,
 * and inserts items into external_catalog_items as an unprocessed feed.
 */
export const syncExternalInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // 1. Fetch the connection record (avoid joins — resolve ownership separately)
    const { data: connection, error: connErr } = await context.supabase
      .from("marketplace_connections")
      .select("*")
      .eq("id", data.connection_id)
      .maybeSingle();

    if (connErr || !connection) throw new Error("Connection not found");

    // Verify ownership
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id, owner_id")
      .eq("id", connection.merchant_id)
      .maybeSingle();

    if (!merchant || merchant.owner_id !== context.userId) throw new Error("Unauthorized");

    // 1b. Deduct credits for sync operation
    const { data: ok } = await context.supabase.rpc("deduct_credits", {
      _merchant_id: merchant.id,
      _amount: CREDIT_COSTS.marketplace_sync,
      _reason: "marketplace_sync",
      _ref_id: data.connection_id,
    });
    if (!ok) throw new Error("Insufficient credits for marketplace sync");

    // 2. Get the vendor adapter
    const adapter = VENDOR_ADAPTERS[connection.platform];
    if (!adapter) throw new Error(`Unsupported platform: ${connection.platform}`);

    // 3. Fetch external catalog
    const vendorProducts = await adapter(connection.oauth_token_hash, connection.store_url ?? "");

    // 4. Upsert catalog items (skip duplicates by connection_id + external_sku)
    let inserted = 0;
    for (const item of vendorProducts) {
      const { error: upsertErr } = await context.supabase
        .from("external_catalog_items")
        .upsert({
          connection_id: connection.id,
          external_sku: item.sku,
          title: item.title,
          description: item.description,
          price_cents: item.price_cents,
          currency: item.currency,
          image_urls: item.image_urls,
          status: "unprocessed",
        }, { onConflict: "connection_id,external_sku", ignoreDuplicates: false });

      if (!upsertErr) inserted++;
    }

    // 5. Update last_sync_at
    await context.supabase
      .from("marketplace_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", connection.id);

    return { synced: inserted, total: vendorProducts.length };
  });

export const listExternalCatalogItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    connection_id: z.string().uuid().optional(),
    status: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Resolve merchant_id to filter by ownership
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return [];

    // Get merchant's connection IDs
    const { data: conns } = await context.supabase
      .from("marketplace_connections")
      .select("id, platform")
      .eq("merchant_id", merchant.id);
    const connIds = (conns ?? []).map(c => c.id);
    if (connIds.length === 0) return [];

    let query = context.supabase
      .from("external_catalog_items")
      .select("*")
      .in("connection_id", connIds)
      .order("created_at", { ascending: false });

    if (data.connection_id) {
      query = query.eq("connection_id", data.connection_id);
    }
    if (data.status) {
      query = query.eq("status", data.status);
    }

    const { data: items, error } = await query;
    if (error) throw error;

    // Attach platform info from connections
    const connMap = new Map((conns ?? []).map(c => [c.id, c.platform]));
    return (items ?? []).map(item => ({ ...item, marketplace_connections: { platform: connMap.get(item.connection_id) } }));
  });

export const approveCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    item_id: z.string().uuid(),
    create_processing_job: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // 1. Fetch the catalog item (avoid joins)
    const { data: item, error: itemErr } = await context.supabase
      .from("external_catalog_items")
      .select("*")
      .eq("id", data.item_id)
      .maybeSingle();

    if (itemErr || !item) throw new Error("Catalog item not found");

    // Verify ownership via connection → merchant
    const { data: connection } = await context.supabase
      .from("marketplace_connections")
      .select("id, merchant_id")
      .eq("id", item.connection_id)
      .maybeSingle();
    if (!connection) throw new Error("Connection not found");

    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id, owner_id")
      .eq("id", connection.merchant_id)
      .maybeSingle();
    if (!merchant || merchant.owner_id !== context.userId) throw new Error("Unauthorized");

    // 2. Deduct credits if creating a processing job
    if (data.create_processing_job) {
      const { data: ok } = await context.supabase.rpc("deduct_credits", {
        _merchant_id: merchant.id,
        _amount: CREDIT_COSTS.processing_job,
        _reason: "processing_job",
        _ref_id: data.item_id,
      });
      if (!ok) throw new Error("Insufficient credits for 3D generation");
    }

    // 3. Update status to approved
    const { error: updateErr } = await context.supabase
      .from("external_catalog_items")
      .update({ status: "approved" })
      .eq("id", data.item_id);
    if (updateErr) throw updateErr;

    // 3. Optionally create a processing job for 3D generation
    if (data.create_processing_job) {
      // Create a draft product from the catalog item
      const { data: product, error: prodErr } = await context.supabase
        .from("products")
        .insert({
          merchant_id: connection.merchant_id,
          title: item.title,
          slug: `ext-${item.external_sku}-${Date.now().toString(36)}`,
          description: item.description,
          price_cents: item.price_cents ?? 0,
          currency: item.currency ?? "USD",
          thumbnail_url: item.image_urls?.[0] ?? null,
          status: "draft",
        })
        .select("id")
        .single();

      if (prodErr) throw prodErr;

      // Link the catalog item to the new product
      await context.supabase
        .from("external_catalog_items")
        .update({ mapped_product_id: product.id, status: "synced" })
        .eq("id", data.item_id);

      // Queue processing job (credit already deducted above)
      await context.supabase.from("processing_jobs").insert({
        product_id: product.id,
        merchant_id: connection.merchant_id,
        provider: "meshy",
        status: "queued",
        input: { source: "marketplace_sync", external_sku: item.external_sku, image_urls: item.image_urls },
        retries: 0,
        max_retries: 5,
        next_retry_at: new Date(Date.now() + 1000).toISOString(),
      });
    }

    return { ok: true };
  });

export const rejectCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ item_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("external_catalog_items")
      .update({ status: "rejected" })
      .eq("id", data.item_id);
    if (error) throw error;
    return { ok: true };
  });
