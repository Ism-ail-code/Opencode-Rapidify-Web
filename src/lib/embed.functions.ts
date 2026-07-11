import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    event_type: z.enum(["product_view", "ar_launch", "buy_click", "qr_open", "embed_open", "variant_switch", "session_start"]),
    session_id: z.string().nullable().optional(),
    product_id: z.string().uuid().nullable().optional(),
    merchant_id: z.string().uuid().nullable().optional(),
    variant_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    device_type: z.enum(["desktop", "mobile"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("analytics_events").insert({
      event_type: data.event_type,
      session_id: data.session_id ?? null,
      product_id: data.product_id ?? null,
      merchant_id: data.merchant_id ?? null,
      variant_id: data.variant_id ?? null,
      metadata: (data.metadata ?? null) as unknown,
      user_agent: null,
    });
    if (error) throw error;
    return { ok: true };
  });

/**
 * Resolves product metadata for the embed script.
 * Supports two lookup strategies:
 *   1. External SKU lookup via marketplace catalog (data-external-sku)
 *   2. Product slug lookup (data-merchant-slug)
 *
 * The API route at /api/public/asset-meta is the public-facing endpoint.
 * This server function is used internally by getEmbedScript.
 */
export const getPublicAssetMeta = createServerFn({ method: "GET" })
  .inputValidator((d: {
    merchant_slug?: string;
    external_sku?: string;
    external_product_id?: string; // legacy alias for external_sku
  }) => z.object({
    merchant_slug: z.string().min(1).max(120).optional(),
    external_sku: z.string().min(1).max(120).optional(),
    external_product_id: z.string().min(1).max(120).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sku = data.external_sku ?? data.external_product_id;

    // Strategy 1: External SKU lookup via marketplace catalog
    if (sku) {
      const { data: catalogItem } = await supabaseAdmin
        .from("external_catalog_items")
        .select("id, mapped_product_id, title, image_urls")
        .eq("external_sku", sku)
        .eq("status", "synced")
        .maybeSingle();

      if (catalogItem?.mapped_product_id) {
        const { data: product } = await supabaseAdmin
          .from("products")
          .select("id, slug, title, description, price_cents, currency, model_glb_url, model_usdz_url, buy_url, status, merchant_id")
          .eq("id", catalogItem.mapped_product_id)
          .eq("status", "active")
          .maybeSingle();

        if (product) {
          const { data: variants } = await supabaseAdmin
            .from("product_variants")
            .select("id, name, color_hex, model_glb_url, model_usdz_url, sort_order")
            .eq("product_id", product.id)
            .order("sort_order", { ascending: true });

          const { data: jobs } = await supabaseAdmin
            .from("processing_jobs")
            .select("status, provider")
            .eq("product_id", product.id)
            .order("created_at", { ascending: false })
            .limit(1);

          const latestJob = jobs?.[0];
          const isReady = latestJob?.status === "ready";

          return {
            ready: isReady,
            product_id: product.id,
            merchant_id: product.merchant_id,
            slug: product.slug,
            glb_url: product.model_glb_url,
            usdz_url: product.model_usdz_url,
            product_title: product.title,
            price_cents: product.price_cents,
            currency: product.currency,
            thumbnail_url: null,
            buy_url: product.buy_url,
            variants: variants ?? [],
          };
        }
      }
    }

    // Strategy 2: Product slug lookup (merchant_slug maps to product.slug)
    if (data.merchant_slug) {
      const { data: product, error: productError } = await supabaseAdmin
        .from("products")
        .select("id, slug, title, description, price_cents, currency, model_glb_url, model_usdz_url, buy_url, status, merchant_id")
        .eq("slug", data.merchant_slug)
        .eq("status", "active")
        .maybeSingle();

      if (productError) throw productError;
      if (!product) return null;

      const { data: variants, error: variantsError } = await supabaseAdmin
        .from("product_variants")
        .select("id, name, color_hex, model_glb_url, model_usdz_url, sort_order")
        .eq("product_id", product.id)
        .order("sort_order", { ascending: true });

      if (variantsError) throw variantsError;

      const { data: jobs, error: jobsError } = await supabaseAdmin
        .from("processing_jobs")
        .select("status, provider")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (jobsError) throw jobsError;

      const latestJob = jobs?.[0];
      const isReady = latestJob?.status === "ready";

      return {
        ready: isReady,
        product_id: product.id,
        merchant_id: product.merchant_id,
        slug: product.slug,
        glb_url: product.model_glb_url,
        usdz_url: product.model_usdz_url,
        product_title: product.title,
        price_cents: product.price_cents,
        currency: product.currency,
        thumbnail_url: null,
        buy_url: product.buy_url,
        variants: variants ?? [],
      };
    }

    return null;
  });

export const getEmbedScript = createServerFn({ method: "GET" })
  .inputValidator((d: {
    merchant_slug: string;
    external_sku?: string;
    mount_selector?: string;
  }) => z.object({
    merchant_slug: z.string().min(1).max(120),
    external_sku: z.string().min(1).max(120).optional(),
    mount_selector: z.string().min(1).max(120).default(".product-buy-button"),
  }).parse(d))
  .handler(async ({ data }) => {
    const script = `<script src="/embed.js"
  data-merchant-slug="${data.merchant_slug}"
  ${data.external_sku ? `data-external-sku="${data.external_sku}"` : ""}
  data-mount="${data.mount_selector}"
  defer></script>`;

    return script;
  });
