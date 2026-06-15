import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CacheEntry<T> = { data: T; expiry: number };
const memoryCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 60000;

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  memoryCache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL): void {
  memoryCache.set(key, { data, expiry: Date.now() + ttl });
}

function invalidateCache(pattern: string): void {
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) memoryCache.delete(key);
  }
}

export const getCachedProducts = createServerFn({ method: "GET" })
  .handler(async () => {
    const cacheKey = "public-products";
    const cached = getCached<Array<Record<string, any>>>(cacheKey);
    if (cached) return { products: cached, cached: true };

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, slug, title, thumbnail_url, price_cents, currency, merchants:merchant_id(name, slug)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    setCache(cacheKey, data || [], 30000);
    return { products: data || [], cached: false };
  });

export const getCachedPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const cacheKey = `public-product:${data.slug}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;

    const result = await supabaseAdmin
      .from("products")
      .select("id, slug, title, description, price_cents, currency, thumbnail_url, model_glb_url, model_usdz_url, buy_url, status, merchant_id, merchants:merchant_id(id, name, slug, logo_url, brand_color)")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();

    if (result.error) throw result.error;
    if (!result.data) return null;

    const { data: variants } = await supabaseAdmin
      .from("product_variants")
      .select("id, name, color_hex, model_glb_url, model_usdz_url, thumbnail_url, sort_order")
      .eq("product_id", result.data.id)
      .order("sort_order", { ascending: true });

    const response = { product: result.data, variants: variants ?? [] };
    setCache(cacheKey, response, 15000);
    return response;
  });

export const invalidateProductCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    invalidateCache("product");
    return { ok: true };
  });

export const optimizeQuery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    queryKey: z.string(),
    params: z.record(z.unknown()).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const cacheKey = `query:${data.queryKey}:${JSON.stringify(data.params || {})}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return { result: cached, cached: true, cacheKey };
    return { result: null, cached: false, cacheKey };
  });

export const prefetchProducts = createServerFn({ method: "GET" })
  .handler(async () => {
    const ids: string[] = [];
    const { data } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) ids.push(...data.map(p => p.id));
    return { prefetchIds: ids };
  });

export { getCached, setCache, invalidateCache, memoryCache }; 