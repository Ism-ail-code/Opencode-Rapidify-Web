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
      .select("id, slug, title, description, price_cents, currency, thumbnail_url, model_glb_url, model_usdz_url, buy_url, status, merchant_id, merchants:merchant_id(id, name, slug, logo_url, brand_color)")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      console.error("[getPublicProduct] Query error:", error.message);
      return null;
    }
    if (!product) return null;
    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select("id, name, color_hex, model_glb_url, model_usdz_url, thumbnail_url, sort_order")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true });
    return { product, variants: variants ?? [] };
  });

export const listFeaturedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, slug, title, thumbnail_url, price_cents, currency, merchants:merchant_id(name, slug)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.error("[listFeaturedProducts] Query error:", error.message);
    return [];
  }
  return data ?? [];
});

export const listMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, slug, title, status, thumbnail_url, price_cents, currency, updated_at, merchant_id")
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

    await context.supabase
      .from("processing_jobs")
      .insert({
        product_id: ins.id, merchant_id: merchantId, provider: "meshy",
        status: "queued", input: { source: "manual_upload" },
        retries: 0, max_retries: 5,
        next_retry_at: new Date(Date.now() + 1000).toISOString(),
      });

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
