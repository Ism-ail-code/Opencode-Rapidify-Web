import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ShopifyProductSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().min(1),
  body_html: z.string().nullable().optional(),
  status: z.string().optional(),
  variants: z.array(z.object({
    id: z.union([z.number(), z.string()]),
    sku: z.string().nullable().optional(),
    price: z.union([z.string(), z.number()]).optional(),
  })).default([]),
  images: z.array(z.object({ src: z.string().url() })).default([]),
});

type ShopifyProduct = z.infer<typeof ShopifyProductSchema>;

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/<[^>]*>/g, "").trim() || null;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function verifyShopifyHmac(rawBody: string, receivedSignature: string, secret: string) {
  if (!receivedSignature || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    return constantTimeEqual(toBase64(new Uint8Array(digest)), receivedSignature.trim());
  } catch (error) {
    console.error("[shopify-webhook] HMAC verification failed", error);
    return false;
  }
}

async function resolveBusinessId(shopDomain: string) {
  const normalized = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  if (!normalized) return null;

  const candidates = [normalized, `https://${normalized}`, `http://${normalized}`];
  for (const storeUrl of candidates) {
    const { data } = await supabaseAdmin
      .from("store_integrations")
      .select("business_id")
      .eq("platform", "shopify")
      .eq("store_url", storeUrl)
      .eq("status", "active")
      .maybeSingle();
    if (data?.business_id) return data.business_id;
  }

  const { data: legacyConnection } = await supabaseAdmin
    .from("marketplace_connections")
    .select("business_id")
    .eq("platform", "shopify")
    .ilike("store_url", `%${normalized}%`)
    .maybeSingle();
  return legacyConnection?.business_id ?? null;
}

async function writeWebhookLog(input: {
  businessId: string | null;
  topic: string;
  signatureValid: boolean;
  payload: unknown;
  error?: string;
  processed?: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("webhook_logs")
    .insert({
      business_id: input.businessId,
      platform: "shopify",
      topic: input.topic,
      signature_valid: input.signatureValid,
      payload: input.payload as never,
      error: input.error ?? null,
      processed_at: input.processed ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) console.error("[shopify-webhook] Could not write webhook log", error);
  return data?.id ?? null;
}

async function completeWebhookLog(id: string | null, error?: string) {
  if (!id) return;
  const { error: updateError } = await supabaseAdmin
    .from("webhook_logs")
    .update({ error: error ?? null, processed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) console.error("[shopify-webhook] Could not complete webhook log", updateError);
}

async function getMerchantForBusiness(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("merchants")
    .select("id")
    .eq("owner_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Merchant workspace not found for this Shopify store");
  return data.id;
}

/** Shared sync core used by the HTTP webhook and the gated developer simulation. */
export async function syncShopifyProduct(businessId: string, topic: string, payload: unknown) {
  const product = ShopifyProductSchema.parse(payload);
  const merchantId = await getMerchantForBusiness(businessId);
  const externalProductId = String(product.id);

  if (topic === "products/delete") {
    const { error } = await supabaseAdmin
      .from("products")
      .update({ status: "archived" })
      .eq("business_id", businessId)
      .eq("external_product_id", externalProductId);
    if (error) throw error;
    return { action: "archived", productId: externalProductId };
  }

  if (topic !== "products/create" && topic !== "products/update") {
    return { action: "ignored", productId: externalProductId };
  }

  const variant = product.variants[0];
  const externalSku = variant?.sku?.trim() || externalProductId;
  const imageUrl = product.images[0]?.src ?? null;
  const price = Number(variant?.price ?? 0);
  const priceCents = Number.isFinite(price) ? Math.max(0, Math.round(price * 100)) : 0;
  const slug = `shopify-${businessId.slice(0, 8)}-${externalProductId}`.slice(0, 120);

  // First: look for an existing product by external_product_id (stable identifier).
  // This handles the case where Shopify sends an update that changes the SKU value —
  // an upsert-by-sku would conflict with the (business_id, external_sku) unique constraint.
  const { data: existingByProductId } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .eq("external_product_id", externalProductId)
    .maybeSingle();

  let syncedProductId: string;

  const productFields = {
    business_id: businessId,
    merchant_id: merchantId,
    external_sku: externalSku,
    external_product_id: externalProductId,
    slug,
    title: product.title,
    description: cleanText(product.body_html),
    price_cents: priceCents,
    currency: "USD",
    image_url: imageUrl,
    thumbnail_url: imageUrl,
    status: product.status === "archived" ? "archived" : "active",
  } as const;

  if (existingByProductId) {
    // Update the existing record by primary key — safe even if the SKU changed.
    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update(productFields)
      .eq("id", existingByProductId.id);
    if (updateError) throw updateError;
    syncedProductId = existingByProductId.id;
  } else {
    // New product: insert (or upsert by external_sku as a final safety net).
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("products")
      .upsert(productFields, { onConflict: "business_id,external_sku" })
      .select("id")
      .single();
    if (insertError || !inserted) throw insertError ?? new Error("Product sync returned no product");
    syncedProductId = inserted.id;
  }

  const { data: pendingJob, error: jobLookupError } = await supabaseAdmin
    .from("processing_jobs")
    .select("id")
    .eq("product_id", syncedProductId)
    .in("status", ["queued", "processing", "optimizing"])
    .maybeSingle();
  if (jobLookupError) throw jobLookupError;

  if (!pendingJob) {
    const { error: jobError } = await supabaseAdmin.from("processing_jobs").insert({
      business_id: businessId,
      merchant_id: merchantId,
      product_id: syncedProductId,
      provider: "meshy",
      status: "queued",
      input: { source: "shopify_webhook", topic, external_product_id: externalProductId, external_sku: externalSku, image_url: imageUrl },
      retries: 0,
      max_retries: 5,
      next_retry_at: new Date().toISOString(),
    });
    if (jobError) throw jobError;
  }

  return { action: "upserted", productId: syncedProductId };
}

export async function handleShopifyWebhookRequest(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });

  const rawBody = await request.text();
  const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "unknown";
  const shopDomain = request.headers.get("x-shopify-shop-domain") ?? "";
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await writeWebhookLog({ businessId: null, topic, signatureValid: false, payload: { raw: rawBody.slice(0, 10_000) }, error: "Invalid JSON", processed: true });
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!secret) {
    console.error("[shopify-webhook] SHOPIFY_WEBHOOK_SECRET is not configured");
    await writeWebhookLog({ businessId: null, topic, signatureValid: false, payload, error: "Webhook secret is not configured", processed: true });
    return json({ error: "Webhook verification is unavailable" }, 503);
  }

  const signatureValid = await verifyShopifyHmac(rawBody, signature, secret);
  if (!signatureValid) {
    await writeWebhookLog({ businessId: null, topic, signatureValid: false, payload, error: "Invalid HMAC signature", processed: true });
    return json({ error: "Invalid HMAC signature" }, 401);
  }

  const businessId = await resolveBusinessId(shopDomain);
  const logId = await writeWebhookLog({ businessId, topic, signatureValid: true, payload });
  if (!businessId) {
    await completeWebhookLog(logId, "No active Rapidify store integration for this Shopify domain");
    // Acknowledge valid, unlinked webhooks to avoid Shopify retries while keeping
    // a durable audit record for support.
    return json({ ok: true, ignored: true });
  }

  try {
    const result = await syncShopifyProduct(businessId, topic, payload);
    await completeWebhookLog(logId);
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("[shopify-webhook] Processing failed", { topic, businessId, message });
    await completeWebhookLog(logId, message);
    return json({ error: "Webhook processing failed" }, 500);
  }
}
