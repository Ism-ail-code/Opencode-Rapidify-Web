import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const demoCatalog = [
  "Walnut Lounge Chair",
  "Arc Floor Lamp",
  "Cloud Side Table",
  "Studio Headphones",
  "Canvas Weekender",
  "Ceramic Vase Set",
  "Modular Desk",
  "Everyday Sneakers",
];

function developerToolsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEVELOPER_TOOLS === "true";
}

function assertDeveloperToolsEnabled() {
  if (!developerToolsEnabled()) throw new Error("Developer tools are disabled. Set ENABLE_DEVELOPER_TOOLS=true in a non-production test environment.");
}

async function getMerchant(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const slug = `demo-store-${context.userId.slice(0, 8)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: newMerchant, error: createError } = await supabaseAdmin
      .from("merchants")
      .insert({
        owner_id: context.userId,
        name: "Demo Store",
        slug,
        store_domain: "https://demo-store.rapidify.app",
        marketplace: "other",
      })
      .select("id")
      .single();
    if (createError) throw createError;
    return newMerchant;
  }
  return data;
}

async function insertProduct(context: { supabase: any; userId: string }, merchantId: string, title: string, position: number) {
  const suffix = `${Date.now().toString(36)}-${position}`;
  const slug = `demo-${context.userId.slice(0, 8)}-${position}-${suffix}`;
  const imageUrl = `https://placehold.co/600x600/e2e8f0/0f172a?text=${encodeURIComponent(title)}`;
  const { data, error } = await context.supabase
    .from("products")
    .insert({
      business_id: context.userId,
      merchant_id: merchantId,
      external_sku: `DEMO-${suffix}`.toUpperCase(),
      slug,
      title,
      description: "Demo product created by Rapidify developer tools.",
      price_cents: 4900 + position * 700,
      currency: "USD",
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      status: "active",
    })
    .select("id, title")
    .single();
  if (error) throw error;
  return data;
}

/** A single demo product is intentionally available outside developer mode. */
export const insertDemoProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchant = await getMerchant(context);
    const product = await insertProduct(context, merchant.id, "Rapidify Demo Product", 1);
    return { product };
  });

export const generateDemoWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDeveloperToolsEnabled();
    const merchant = await getMerchant(context);
    const total = 5 + Math.floor(Math.random() * 6);
    const products = await Promise.all(demoCatalog.slice(0, total).map((title, index) => insertProduct(context, merchant.id, title, index + 1)));

    const events = products.flatMap((product, index) => {
      const session = `demo-${Date.now()}-${index}`;
      return [
        { business_id: context.userId, merchant_id: merchant.id, product_id: product.id, event_type: "page_view", session_id: session, metadata: {} },
        { business_id: context.userId, merchant_id: merchant.id, product_id: product.id, event_type: "ar_widget_visible", session_id: session, metadata: {} },
        { business_id: context.userId, merchant_id: merchant.id, product_id: product.id, event_type: "ar_launch", session_id: session, metadata: {} },
        { business_id: context.userId, merchant_id: merchant.id, product_id: product.id, event_type: "ar_session_end", session_id: session, metadata: { duration_seconds: 24 + index } },
        { business_id: context.userId, merchant_id: merchant.id, product_id: product.id, event_type: "add_to_cart", session_id: session, metadata: {} },
        ...(index % 2 === 0 ? [{ business_id: context.userId, merchant_id: merchant.id, product_id: product.id, event_type: "purchase_completed", session_id: session, metadata: { revenue_cents: 4900 + index * 700 } }] : []),
      ];
    });
    const { error: eventError } = await context.supabase.from("analytics_events").insert(events);
    if (eventError) throw eventError;
    return { productsCreated: products.length, eventsCreated: events.length };
  });

export const simulateShopifyWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDeveloperToolsEnabled();
    const { syncShopifyProduct } = await import("@/lib/shopify-webhook.server");
    const productId = Math.floor(Date.now() / 1000);
    const payload = {
      id: productId,
      title: "Shopify webhook demo product",
      body_html: "<p>Created from a simulated Shopify products/update event.</p>",
      status: "active",
      variants: [{ id: productId, sku: `SHOP-DEMO-${productId}`, price: "79.00" }],
      images: [{ src: "https://placehold.co/600x600/f1f5f9/0f172a?text=Shopify+Demo" }],
    };
    const result = await syncShopifyProduct(context.userId, "products/update", payload);
    return { ok: true, result };
  });

export const resetDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDeveloperToolsEnabled();
    const { error: analyticsError } = await context.supabase.from("analytics_events").delete().eq("business_id", context.userId);
    if (analyticsError) throw analyticsError;
    const { error: modelsError } = await context.supabase.from("models").delete().eq("business_id", context.userId);
    if (modelsError) throw modelsError;
    const { error: jobsError } = await context.supabase.from("processing_jobs").delete().eq("business_id", context.userId);
    if (jobsError) throw jobsError;
    const { error: productsError } = await context.supabase.from("products").delete().eq("business_id", context.userId);
    if (productsError) throw productsError;
    return { ok: true };
  });
