import { supabaseAdmin } from "@/integrations/supabase/client.server";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

/** Public, minimal resolver consumed by embed.js. It never exposes credentials. */
export async function handlePublicAssetMetaRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);

  const url = new URL(request.url);
  const sku = url.searchParams.get("sku") || url.searchParams.get("asin") || url.searchParams.get("external_sku");
  const slug = url.searchParams.get("slug");
  const merchantSlugParam = url.searchParams.get("merchant_slug");

  // ── Resolve merchant slug to merchant_id for scoped lookup ────────
  let merchantId: string | null = null;
  if (merchantSlugParam) {
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .eq("slug", merchantSlugParam)
      .maybeSingle();
    merchantId = merchant?.id ?? null;
  }

  let query = supabaseAdmin
    .from("products")
    .select("id, slug, title, image_url, thumbnail_url, model_glb_url, model_usdz_url, external_sku, status, merchant_id")
    .eq("status", "active");

  if (sku) {
    query = query.eq("external_sku", sku);
    // When a merchant slug is provided, scope the lookup to that merchant.
    // This prevents cross-tenant SKU collisions.
    if (merchantId) query = query.eq("merchant_id", merchantId);
  } else if (slug) {
    query = query.eq("slug", slug);
    if (merchantId) query = query.eq("merchant_id", merchantId);
  } else return response({ ready: false });

  const { data: product, error } = await query.maybeSingle();
  if (error) {
    console.error("[asset-meta] Product lookup failed", error);
    return response({ ready: false }, 500);
  }
  if (!product) return response({ ready: false });

  const { data: model, error: modelError } = await supabaseAdmin
    .from("models")
    .select("status, model_url, usdz_url")
    .eq("product_id", product.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (modelError) console.error("[asset-meta] Model lookup failed", modelError);

  const modelStatus = model?.status ?? ((product.model_glb_url || product.model_usdz_url) ? "ready" : "missing");
  const ready = modelStatus === "ready";
  return response({
    ready,
    model_status: modelStatus,
    product_id: product.id,
    slug: product.slug,
    sku: product.external_sku,
    product_title: product.title,
    image_url: product.image_url || product.thumbnail_url || "/placeholder.png",
    model_url: model?.model_url || product.model_glb_url || null,
    usdz_url: model?.usdz_url || product.model_usdz_url || null,
  });
}
