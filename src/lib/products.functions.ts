import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const getPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select("id, slug, title, description, price_cents, currency, model_glb_url, model_usdz_url, buy_url, status, merchant_id")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      console.error("[getPublicProduct] Query error:", error.message);
      return null;
    }
    if (!product) return null;

    // Fetch merchant info separately to avoid schema-cache join issues
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id, name, slug, logo_url, brand_color")
      .eq("id", product.merchant_id)
      .maybeSingle();

    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select("id, name, color_hex, model_glb_url, model_usdz_url, sort_order")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true });
    return { product: { ...product, merchants: merchant }, variants: variants ?? [] };
  });

export const listFeaturedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, slug, title, price_cents, currency, merchant_id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.error("[listFeaturedProducts] Query error:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  // Fetch merchant names separately
  const merchantIds = [...new Set(data.map(p => p.merchant_id))];
  const { data: merchants } = await supabaseAdmin
    .from("merchants")
    .select("id, name, slug")
    .in("id", merchantIds);
  const merchantMap = new Map((merchants ?? []).map(m => [m.id, m]));

  return data.map(p => ({ ...p, merchants: merchantMap.get(p.merchant_id) ?? null }));
});

export const listMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return [];

    const { data, error } = await context.supabase
      .from("products")
      .select("id, title, status, price_cents, currency, updated_at, merchant_id")
      .eq("merchant_id", merchant.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getMyProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: product, error } = await context.supabase
      .from("products").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    const { data: variants } = await context.supabase
      .from("product_variants").select("*").eq("product_id", data.id).order("sort_order");
    return { product, variants: variants ?? [] };
  });

const productSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().max(4000).optional().nullable(),
  price_cents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  thumbnail_url: z.string().url().optional().nullable().or(z.literal("")),
  model_glb_url: z.string().url().optional().nullable().or(z.literal("")),
  model_usdz_url: z.string().url().optional().nullable().or(z.literal("")),
  buy_url: z.string().optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("active"),
});

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants").select("id").eq("owner_id", context.userId).maybeSingle();
    let merchantId = merchant?.id;
    if (!merchantId) {
      const baseSlug = slugify(`store-${context.userId.slice(0, 8)}`);
      const { data: created, error: cErr } = await context.supabase
        .from("merchants").insert({ owner_id: context.userId, slug: baseSlug, name: "My Store" }).select("id").single();
      if (cErr) throw cErr;
      merchantId = created.id;
    }

    const payload = {
      merchant_id: merchantId,
      title: data.title,
      slug: data.slug || slugify(data.title) + "-" + Math.random().toString(36).slice(2, 6),
      description: data.description || null,
      price_cents: data.price_cents,
      currency: data.currency,
      thumbnail_url: data.thumbnail_url || null,
      model_glb_url: data.model_glb_url || null,
      model_usdz_url: data.model_usdz_url || null,
      buy_url: data.buy_url || null,
      status: data.status,
    };

    if (data.id) {
      const { data: up, error } = await context.supabase
        .from("products").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return up;
    }
    const { data: ins, error } = await context.supabase
      .from("products").insert(payload).select().single();
    if (error) throw error;

    // Only create a processing job if the user did NOT provide direct 3D files.
    // Direct uploads (GLB/USDZ) bypass the queue and go live instantly.
    const hasDirectModels = !!(data.model_glb_url || data.model_usdz_url);
    if (!hasDirectModels) {
      await context.supabase
        .from("processing_jobs")
        .insert({
          product_id: ins.id, merchant_id: merchantId, provider: "meshy",
          status: "queued", input: { source: "manual_upload" },
          retries: 0, max_retries: 5,
          next_retry_at: new Date(Date.now() + 1000).toISOString(),
        });
    }

    return ins;
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Called by the Flutter mobile app after a LiDAR/camera scan completes.
 * Uploads the captured GLB/USDZ directly to storage, updates the product,
 * and marks it live — completely bypassing the background job queue.
 */
export const finalizeDirectUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    product_id: z.string().uuid(),
    model_glb_url: z.string().url().optional().nullable(),
    model_usdz_url: z.string().url().optional().nullable(),
    thumbnail_url: z.string().url().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the user owns this product (separate queries to avoid schema-cache join issues)
    const { data: product, error: fetchErr } = await supabaseAdmin
      .from("products")
      .select("id, merchant_id")
      .eq("id", data.product_id)
      .maybeSingle();

    if (fetchErr || !product) throw new Error("Product not found");

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("owner_id")
      .eq("id", product.merchant_id)
      .maybeSingle();

    if (!merchant || merchant.owner_id !== context.userId) {
      throw new Error("Unauthorized");
    }

    // Update the product with the direct 3D assets
    const updatePayload: Record<string, unknown> = { status: "active" };
    if (data.model_glb_url) updatePayload.model_glb_url = data.model_glb_url;
    if (data.model_usdz_url) updatePayload.model_usdz_url = data.model_usdz_url;
    if (data.thumbnail_url) updatePayload.thumbnail_url = data.thumbnail_url;

    const { error: updateErr } = await supabaseAdmin
      .from("products")
      .update(updatePayload)
      .eq("id", data.product_id);

    if (updateErr) throw updateErr;

    // Mark any queued processing jobs as "ready" (skip the queue)
    await supabaseAdmin
      .from("processing_jobs")
      .update({ status: "ready", output: { source: "direct_upload", completed_at: new Date().toISOString() } })
      .eq("product_id", data.product_id)
      .in("status", ["queued", "processing"]);

    return { success: true, product_id: data.product_id };
  });
