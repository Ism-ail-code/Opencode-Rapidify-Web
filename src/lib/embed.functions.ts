import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    event_type: z.enum(["product_view", "page_view", "ar_widget_visible", "ar_launch", "ar_session_end", "add_to_cart", "purchase_completed", "buy_click", "qr_open", "embed_open", "variant_switch", "session_start"]),
    session_id: z.string().nullable().optional(),
    product_id: z.string().uuid().nullable().optional(),
    merchant_id: z.string().uuid().nullable().optional(),
    variant_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    device_type: z.enum(["desktop", "mobile"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.product_id) return { ok: true, accepted: 0 };

    // Do not trust a public browser to nominate a business. The product is the
    // authority for both tenant IDs, preventing cross-tenant event injection.
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, business_id, merchant_id, status")
      .eq("id", data.product_id)
      .eq("status", "active")
      .maybeSingle();
    if (productError) throw productError;
    if (!product?.business_id) return { ok: true, accepted: 0 };

    const { error } = await supabaseAdmin.from("analytics_events").insert({
      event_type: data.event_type,
      session_id: data.session_id ?? null,
      product_id: data.product_id ?? null,
      merchant_id: product.merchant_id,
      business_id: product.business_id,
      variant_id: data.variant_id ?? null,
      metadata: (data.metadata ?? null) as never,
      user_agent: null,
    });
    if (error) throw error;
    return { ok: true, accepted: 1 };
  });

/**
 * Resolves product metadata for the embed script.
 * Supports lookup by SKU (optionally scoped to a merchant slug).
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

/**
 * Generates an embed script snippet.
 *
 * Two modes:
 *   1. **Global script (recommended)** — Provide only `merchant_slug`.
 *      The resulting snippet uses the `data-merchant` attribute and relies
 *      on auto-detection of the product SKU from the page. One script works
 *      for ALL products in the store.
 *
 *   2. **Per-product script** — Provide both `merchant_slug` and
 *      `external_sku`. The snippet pins the product explicitly for stores
 *      where auto-detection does not work.
 *
 * @example global
 *   getEmbedScript({ merchant_slug: "alexs-furniture" })
 *   // → <script src="/embed.js" data-merchant="alexs-furniture" defer></script>
 *
 * @example per-product
 *   getEmbedScript({ merchant_slug: "alexs-furniture", external_sku: "CHAIR-001" })
 *   // → <script src="/embed.js" data-merchant="alexs-furniture" data-external-sku="CHAIR-001" defer></script>
 */
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
    if (data.external_sku) {
      return `<script src="/embed.js"
  data-merchant="${data.merchant_slug}"
  data-external-sku="${data.external_sku}"
  data-mount="${data.mount_selector}"
  defer></script>`;
    }
    // Global script — no product-specific attributes.
    // Auto-detection picks up the product from the page.
    return `<script src="/embed.js"
  data-merchant="${data.merchant_slug}"
  data-mount="${data.mount_selector}"
  defer></script>`;
  });
