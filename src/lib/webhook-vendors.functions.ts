import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateWebhookSignature } from "@/lib/security.functions";
import { slugify } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Logs an incoming webhook event to the webhook_events table.
 * Returns the event ID so we can update it after processing.
 */
async function logWebhookEvent(params: {
  merchantId: string | null;
  platform: "shopify" | "amazon" | "daraz";
  eventType: string;
  topic: string;
  payload: unknown;
  headers: Record<string, string>;
  signature: string;
  verified: boolean;
}): Promise<string> {
  const { data } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      merchant_id: params.merchantId,
      platform: params.platform,
      event_type: params.eventType,
      topic: params.topic,
      payload: params.payload as never,
      headers: params.headers as never,
      signature: params.signature,
      verified: params.verified,
      processed: false,
    })
    .select("id")
    .single();
  return data?.id ?? crypto.randomUUID();
}

async function markProcessed(eventId: string, error?: string) {
  await supabaseAdmin
    .from("webhook_events")
    .update({ processed: true, error: error ?? null })
    .eq("id", eventId);
}

async function upsertProductFromWebhook(params: {
  merchantId: string;
  externalSku: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  imageUrls: string[];
  buyUrl: string | null;
}) {
  const slug = slugify(params.title) + "-" + params.externalSku.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);

  const { data: product, error: prodErr } = await supabaseAdmin
    .from("products")
    .upsert({
      merchant_id: params.merchantId,
      title: params.title,
      slug,
      description: params.description,
      price_cents: params.priceCents,
      currency: params.currency,
      thumbnail_url: params.imageUrls[0] ?? null,
      buy_url: params.buyUrl,
      status: "active",
    }, { onConflict: "slug", ignoreDuplicates: false })
    .select("id")
    .single();

  if (prodErr) throw prodErr;

  // Queue a processing job for 3D generation (only for new products)
  if (product) {
    const { data: existingJob } = await supabaseAdmin
      .from("processing_jobs")
      .select("id")
      .eq("product_id", product.id)
      .maybeSingle();

    if (!existingJob) {
      await supabaseAdmin
        .from("processing_jobs")
        .insert({
          product_id: product.id,
          merchant_id: params.merchantId,
          provider: "meshy",
          status: "queued",
          input: { source: "webhook_sync", external_sku: params.externalSku, image_urls: params.imageUrls },
          retries: 0,
          max_retries: 5,
          next_retry_at: new Date(Date.now() + 1000).toISOString(),
        });
    }
  }

  return product;
}

async function resolveMerchantByStoreUrl(storeUrl: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("marketplace_connections")
    .select("merchant_id")
    .eq("store_url", storeUrl)
    .eq("status", "active")
    .maybeSingle();
  return data?.merchant_id ?? null;
}

// ---------------------------------------------------------------------------
// Shopify Webhook Handler
// External URL:  {APP_URL}/_server/fn/handleShopifyWebhook
// ---------------------------------------------------------------------------

const ShopifyWebhookSchema = z.object({
  id: z.number().positive(),
  title: z.string(),
  body_html: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  product_type: z.string().optional().nullable(),
  variants: z.array(z.object({
    id: z.number().positive(),
    title: z.string(),
    price: z.string(),
    sku: z.string().optional().nullable(),
    inventory_quantity: z.number().int().default(0),
  })).optional().default([]),
  images: z.array(z.object({
    src: z.string().url(),
  })).optional().default([]),
  status: z.string().optional().nullable(),
  published_at: z.string().optional().nullable(),
});

export const handleShopifyWebhook = createServerFn({ method: "POST" })
  .handler(async () => {
    const request = getRequest();
    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) { headers[key] = value; }

    const rawBody = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    // 1. HMAC signature verification
    const hmacHeader = headers["x-shopify-hmac-sha256"] ?? "";
    const shopifySecret = process.env.SHOPIFY_CLIENT_SECRET ?? "";
    const signatureValid = shopifySecret
      ? await validateWebhookSignature(rawBody, hmacHeader, shopifySecret)
      : false;

    if (shopifySecret && !signatureValid) {
      return new Response(JSON.stringify({ error: "Invalid HMAC signature" }), { status: 401 });
    }

    // 2. Determine event topic and resolve merchant
    const topic = headers["x-shopify-topic"] ?? "unknown";
    const shopDomain = headers["x-shopify-shop-domain"] ?? "";
    // Resolve via store_url to find matching marketplace_connection
    const merchantId = shopDomain ? await resolveMerchantByStoreUrl(`https://${shopDomain}`) : null;

    // 3. Log the event immediately (before processing, for audit trail)
    const eventId = await logWebhookEvent({
      merchantId,
      platform: "shopify",
      eventType: topic,
      topic,
      payload: parsed,
      headers,
      signature: hmacHeader,
      verified: signatureValid,
    });

    try {
      const validated = ShopifyWebhookSchema.parse(parsed);

      if (!merchantId) {
        await markProcessed(eventId, "No merchant found for this store domain");
        return new Response(JSON.stringify({ ok: true, message: "No merchant mapped — acknowledged" }), { status: 200 });
      }

      // 4. Route by topic
      if (topic === "products/create" || topic === "products/update") {
        const baseVariant = validated.variants[0];
        const priceCents = Math.round(parseFloat(baseVariant?.price ?? "0") * 100);

        await upsertProductFromWebhook({
          merchantId,
          externalSku: baseVariant?.sku ?? String(validated.id),
          title: validated.title,
          description: validated.body_html?.replace(/<[^>]*>/g, "") ?? null,
          priceCents,
          currency: "USD",
          imageUrls: validated.images.map(i => i.src),
          buyUrl: null,
        });
      }

      await markProcessed(eventId);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Webhook processing failed";
      await markProcessed(eventId, msg);
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
  });

// ---------------------------------------------------------------------------
// Amazon SP-API Webhook (Stub with signature validation)
// External URL:  {APP_URL}/_server/fn/handleAmazonWebhook
// ---------------------------------------------------------------------------

const AmazonWebhookSchema = z.object({
  NotificationType: z.string(),
  Payload: z.object({
    AmazonOrderId: z.string().optional(),
    SKU: z.string().optional(),
    ProductName: z.string().optional(),
    Price: z.object({
      Amount: z.number(),
      CurrencyCode: z.string().optional(),
    }).optional(),
    ImageUrl: z.string().optional(),
  }).optional(),
});

export const handleAmazonWebhook = createServerFn({ method: "POST" })
  .handler(async () => {
    const request = getRequest();
    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) { headers[key] = value; }

    const rawBody = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    // 1. Signature validation (Amazon SP-API signatures vary by notification type)
    const sigHeader = headers["x-amz-spi-signature"] ?? headers["authorization"] ?? "";
    const amazonSecret = process.env.AMAZON_CLIENT_SECRET ?? "";
    const signatureValid = amazonSecret
      ? await validateWebhookSignature(rawBody, sigHeader, amazonSecret)
      : false;

    if (amazonSecret && !signatureValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    // 2. Log the event
    const eventId = await logWebhookEvent({
      merchantId: null,
      platform: "amazon",
      eventType: (parsed as any)?.NotificationType ?? "unknown",
      topic: (parsed as any)?.NotificationType ?? "unknown",
      payload: parsed,
      headers,
      signature: sigHeader,
      verified: signatureValid,
    });

    try {
      const validated = AmazonWebhookSchema.parse(parsed);

      // TODO: Implement full Amazon SP-API notification handling:
      // - Listen for ANY_OFFERS_CHANGED / MFN_ORDER notifications
      // - Resolve merchant via marketplace_connections WHERE platform = 'amazon'
      // - Upsert into external_catalog_items
      // - See https://developer-docs.amazon.com/sp-api/docs/notifications-api-v1-use-case-guide

      console.log(`[AmazonWebhook] Received ${validated.NotificationType} — acknowledged (stub)`);

      await markProcessed(eventId);
      return new Response(JSON.stringify({ ok: true, message: "Acknowledged" }), { status: 200 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Webhook processing failed";
      await markProcessed(eventId, msg);
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
  });

// ---------------------------------------------------------------------------
// Daraz Webhook (Stub with signature validation)
// External URL:  {APP_URL}/_server/fn/handleDarazWebhook
// ---------------------------------------------------------------------------

const DarazWebhookSchema = z.object({
  notification_type: z.string(),
  seller_id: z.string().optional(),
  product_id: z.number().optional(),
  sku: z.string().optional(),
  item_name: z.string().optional(),
  price: z.string().optional(),
  image: z.string().optional(),
  timestamp: z.number().optional(),
});

export const handleDarazWebhook = createServerFn({ method: "POST" })
  .handler(async () => {
    const request = getRequest();
    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) { headers[key] = value; }

    const rawBody = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    // 1. Signature validation (Daraz uses HMAC-SHA256 with client secret)
    const sigHeader = headers["x-daraz-signature"] ?? "";
    const darazSecret = process.env.DARAZ_CLIENT_SECRET ?? "";
    const signatureValid = darazSecret
      ? await validateWebhookSignature(rawBody, sigHeader, darazSecret)
      : false;

    if (darazSecret && !signatureValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    // 2. Log the event
    const eventId = await logWebhookEvent({
      merchantId: null,
      platform: "daraz",
      eventType: (parsed as any)?.notification_type ?? "unknown",
      topic: (parsed as any)?.notification_type ?? "unknown",
      payload: parsed,
      headers,
      signature: sigHeader,
      verified: signatureValid,
    });

    try {
      const validated = DarazWebhookSchema.parse(parsed);

      // TODO: Implement full Daraz notification handling:
      // - Listen for product creation/update/deletion
      // - Resolve merchant via marketplace_connections WHERE platform = 'daraz'
      // - Upsert into external_catalog_items
      // - See https://open.daraz.com/doc/notifications

      console.log(`[DarazWebhook] Received ${validated.notification_type} — acknowledged (stub)`);

      await markProcessed(eventId);
      return new Response(JSON.stringify({ ok: true, message: "Acknowledged" }), { status: 200 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Webhook processing failed";
      await markProcessed(eventId, msg);
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
  });
