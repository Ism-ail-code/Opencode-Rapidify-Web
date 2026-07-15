import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** True when the error is just a missing table (no migrations applied yet). */
function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const obj = err as Record<string, unknown>;
  return obj["code"] === "PGRST205" || obj["code"] === "42P01";
}

function numericMetadata(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return 0;
  const number = Number((value as Record<string, unknown>)[key]);
  return Number.isFinite(number) ? number : 0;
}

/** A fault-tolerant dashboard read: empty or partially unavailable tables never throw the dashboard. */
export const getDashboardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const warnings: string[] = [];
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: profile, error: profileError }, { data: merchant, error: merchantError }, { data: products, error: productsError }, { data: events, error: eventsError }, { data: jobs, error: jobsError }] = await Promise.all([
      context.supabase.from("business_profiles").select("id, business_name, onboarding_completed_at, is_verified, marketplace, store_url").eq("id", context.userId).maybeSingle(),
      context.supabase.from("merchants").select("id, name, marketplace, store_domain").eq("owner_id", context.userId).maybeSingle(),
      context.supabase.from("products").select("id, title, image_url, thumbnail_url, external_sku, status, model_glb_url, model_usdz_url, updated_at").eq("business_id", context.userId).order("updated_at", { ascending: false }).limit(8),
      context.supabase.from("analytics_events").select("event_type, session_id, metadata, created_at").eq("business_id", context.userId).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(10000),
      context.supabase.from("processing_jobs").select("id, provider, status, error, updated_at").eq("business_id", context.userId).order("updated_at", { ascending: false }).limit(8),
    ]);

    if (profileError && !isMissingTable(profileError)) warnings.push("Merchant profile could not be refreshed.");
    if (merchantError && !isMissingTable(merchantError)) warnings.push("Merchant workspace could not be refreshed.");
    if (productsError && !isMissingTable(productsError)) warnings.push("Product inventory could not be refreshed.");
    if (eventsError && !isMissingTable(eventsError)) warnings.push("Analytics could not be refreshed.");
    if (jobsError && !isMissingTable(jobsError)) warnings.push("Sync status could not be refreshed.");

    const sessions = new Map<string, { viewed: boolean; launched: boolean; added: boolean; purchased: boolean; revenue: number }>();
    for (const event of events ?? []) {
      const key = event.session_id || `event-${event.created_at}`;
      const session = sessions.get(key) ?? { viewed: false, launched: false, added: false, purchased: false, revenue: 0 };
      if (event.event_type === "page_view" || event.event_type === "product_view") session.viewed = true;
      if (event.event_type === "ar_launch") session.launched = true;
      if (event.event_type === "add_to_cart") session.added = true;
      if (event.event_type === "purchase_completed") {
        session.purchased = true;
        session.revenue += numericMetadata(event.metadata, "revenue_cents");
      }
      sessions.set(key, session);
    }

    const sessionRows = [...sessions.values()];
    const viewedSessions = sessionRows.filter((session) => session.viewed);
    const arSessions = sessionRows.filter((session) => session.launched);
    const addToCartAfterAr = arSessions.filter((session) => session.added).length;
    const purchaseAfterAr = arSessions.filter((session) => session.purchased).length;
    const revenueInfluenced = arSessions.reduce((total, session) => total + session.revenue, 0);
    const failedJobs = (jobs ?? []).filter((job) => job.status === "failed");
    const inFlightJobs = (jobs ?? []).filter((job) => ["queued", "processing", "optimizing"].includes(job.status));

    return {
      profile: profile ?? null,
      merchant: merchant ?? null,
      warnings,
      metrics: {
        totalViews: viewedSessions.length,
        arLaunches: arSessions.length,
        engagementRate: viewedSessions.length ? (arSessions.length / viewedSessions.length) * 100 : 0,
        addToCartAfterAr,
        conversionAfterAr: arSessions.length ? (purchaseAfterAr / arSessions.length) * 100 : 0,
        revenueInfluenced,
      },
      sync: {
        status: failedJobs.length > 0 ? "needs-attention" : inFlightJobs.length > 0 ? "syncing" : "up-to-date",
        queued: inFlightJobs.length,
        failed: failedJobs.length,
      },
      products: (products ?? []).map((product) => ({
        ...product,
        image_url: product.image_url || product.thumbnail_url || "/placeholder.png",
        sku: product.external_sku || "—",
        model_url: product.model_glb_url || product.model_usdz_url || null,
        ar_ready: Boolean(product.model_glb_url || product.model_usdz_url),
      })),
      activity: (events ?? []).slice(0, 8).map((event) => ({ type: event.event_type, created_at: event.created_at })),
      jobs: jobs ?? [],
    };
  });
