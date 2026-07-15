import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff7 = new Date(); cutoff7.setDate(cutoff7.getDate() - 7);
    const cutoff1 = new Date(); cutoff1.setDate(cutoff1.getDate() - 1);

    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("business_id", context.userId)
      .gte("created_at", cutoff30.toISOString());

    const list = events || [];
    const counts = { last30: 0, last7: 0, last24h: 0 };
    const byType: Record<string, number> = {};

    for (const e of list) {
      const date = new Date(e.created_at);
      byType[e.event_type] = (byType[e.event_type] || 0) + 1;
      if (date >= cutoff30) counts.last30++;
      if (date >= cutoff7) counts.last7++;
      if (date >= cutoff1) counts.last24h++;
    }

    return {
      totalEvents: counts.last30,
      last7Days: counts.last7,
      last24Hours: counts.last24h,
      byType,
      period: {
        from: cutoff30.toISOString(),
        to: new Date().toISOString(),
      },
    };
  });

export const getMyAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fourteenDaysAgo = new Date(); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("business_id", context.userId)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    const list = events || [];
    const totals: Record<string, number> = { page_view: 0, product_view: 0, ar_launch: 0, add_to_cart: 0, purchase_completed: 0, buy_click: 0 };
    const dayMap: Record<string, { day: string; views: number; ar: number; buys: number }> = {};

    for (const e of list) {
      if (e.event_type in totals) totals[e.event_type]++;
      const dayKey = new Date(e.created_at).toISOString().slice(0, 10);
      if (!dayMap[dayKey]) dayMap[dayKey] = { day: dayKey, views: 0, ar: 0, buys: 0 };
      if (e.event_type === "product_view" || e.event_type === "page_view") dayMap[dayKey].views++;
      if (e.event_type === "ar_launch") dayMap[dayKey].ar++;
      if (e.event_type === "buy_click" || e.event_type === "add_to_cart") dayMap[dayKey].buys++;
    }

    return {
      totals,
      days: Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day)),
      recent: list.slice(0, 20).map(e => ({ event_type: e.event_type, created_at: e.created_at })),
    };
  });

export const getMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("processing_jobs")
      .select("*")
      .eq("business_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  });

export const getConversionFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("business_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5000);

    const list = events || [];

    const funnel: Record<string, number> = {
      product_view: 0,
      ar_launch: 0,
      buy_click: 0,
      qr_open: 0,
      embed_open: 0,
      variant_switch: 0,
    };

    for (const e of list) {
      if (e.event_type in funnel) funnel[e.event_type as keyof typeof funnel]++;
    }

    const conversionRate = funnel.product_view > 0
      ? ((funnel.buy_click / funnel.product_view) * 100).toFixed(1)
      : "0.0";

    return {
      funnel,
      conversionRate: `${conversionRate}%`,
      totalEvents: list.length,
    };
  });

export const getPerProductAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    productId: z.string().uuid().optional(),
    days: z.number().int().min(1).max(90).default(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - data.days);

    let query = context.supabase
      .from("analytics_events")
      .select("event_type, product_id, created_at, session_id")
      .eq("business_id", context.userId)
      .gte("created_at", cutoff.toISOString());

    if (data.productId) {
      query = query.eq("product_id", data.productId);
    }

    const { data: events } = await query.order("created_at", { ascending: false }).limit(5000);
    const list = events || [];

    const productStats: Record<string, {
      product_id: string;
      views: number;
      ar_launches: number;
      buy_clicks: number;
      sessions: Set<string>;
    }> = {};

    for (const e of list) {
      if (!e.product_id) continue;
      if (!productStats[e.product_id]) {
        productStats[e.product_id] = {
          product_id: e.product_id,
          views: 0,
          ar_launches: 0,
          buy_clicks: 0,
          sessions: new Set(),
        };
      }

      const stat = productStats[e.product_id];
      if (e.event_type === "product_view") stat.views++;
      if (e.event_type === "ar_launch") stat.ar_launches++;
      if (e.event_type === "buy_click") stat.buy_clicks++;
      if (e.session_id) stat.sessions.add(e.session_id);
    }

    const productIds = Object.keys(productStats);
    let products: Array<{ id: string; title: string; slug: string; price_cents: number; currency: string }> = [];
    if (productIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: productRows, error: productError } = await supabaseAdmin
        .from("products")
        .select("id, title, slug, price_cents, currency")
        .in("id", productIds);
      if (productError) throw productError;
      products = productRows ?? [];
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    const result = Object.values(productStats).map(stat => {
      const product = productMap.get(stat.product_id);
      return {
        productId: stat.product_id,
        title: product?.title || "Unknown",
        slug: product?.slug || "",
        thumbnail: null,
        price: product ? (product.price_cents / 100).toFixed(2) : "0.00",
        views: stat.views,
        arLaunches: stat.ar_launches,
        buyClicks: stat.buy_clicks,
        uniqueSessions: stat.sessions.size,
        conversionRate: stat.views > 0
          ? ((stat.buy_clicks / stat.views) * 100).toFixed(1)
          : "0.0",
      };
    }).sort((a, b) => b.views - a.views);

    return result;
  });

// ---------------------------------------------------------------------------
// Revenue Attribution Analytics — measures AR impact on sales
// ---------------------------------------------------------------------------

export interface AttributionSummary {
  totalViews: number;
  arLaunches: number;
  arEngagementRate: string;
  addToCartAfterAr: number;
  conversionRateAfterAr: string;
  estimatedRevenueInfluenced: number;
  avgArSessionDuration: string;
  totalSessions: number;
  arSessions: number;
  purchaseSessions: number;
}

export const getAttributionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AttributionSummary> => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error } = await context.supabase
      .from("analytics_events")
      .select("event_type, session_id, metadata")
      .eq("business_id", context.userId)
      .gte("created_at", cutoff)
      .limit(10000);
    if (error) throw error;

    const sessions = new Map<string, { viewed: boolean; launched: boolean; added: boolean; purchased: boolean; revenue: number; arDuration: number }>();
    for (const event of events ?? []) {
      const sessionId = event.session_id || `event:${crypto.randomUUID()}`;
      const session = sessions.get(sessionId) ?? { viewed: false, launched: false, added: false, purchased: false, revenue: 0, arDuration: 0 };
      if (event.event_type === "page_view" || event.event_type === "product_view") session.viewed = true;
      if (event.event_type === "ar_launch") session.launched = true;
      if (event.event_type === "add_to_cart") session.added = true;
      if (event.event_type === "purchase_completed") {
        session.purchased = true;
        const revenue = event.metadata && typeof event.metadata === "object" && "revenue_cents" in event.metadata
          ? Number((event.metadata as Record<string, unknown>).revenue_cents)
          : 0;
        session.revenue += Number.isFinite(revenue) ? revenue : 0;
      }
      if (event.event_type === "ar_session_end") {
        const duration = event.metadata && typeof event.metadata === "object" && "duration_seconds" in event.metadata
          ? Number((event.metadata as Record<string, unknown>).duration_seconds)
          : 0;
        session.arDuration = Number.isFinite(duration) ? duration : session.arDuration;
      }
      sessions.set(sessionId, session);
    }

    const list = [...sessions.values()];
    const totalViews = list.filter((session) => session.viewed).length;
    const arSessionRows = list.filter((session) => session.launched);
    const arLaunches = arSessionRows.length;
    const addToCartAfterAr = arSessionRows.filter((session) => session.added).length;
    const purchaseSessions = arSessionRows.filter((session) => session.purchased).length;
    const totalRevenue = arSessionRows.reduce((sum, session) => sum + session.revenue, 0);
    const totalArDuration = arSessionRows.reduce((sum, session) => sum + session.arDuration, 0);

    return {
      totalViews,
      arLaunches,
      arEngagementRate: totalViews > 0 ? ((arLaunches / totalViews) * 100).toFixed(1) : "0.0",
      addToCartAfterAr,
      conversionRateAfterAr: arLaunches > 0 ? ((purchaseSessions / arLaunches) * 100).toFixed(1) : "0.0",
      estimatedRevenueInfluenced: totalRevenue,
      avgArSessionDuration: arLaunches > 0 ? formatDuration(Math.round(totalArDuration / arLaunches)) : "0s",
      totalSessions: list.length,
      arSessions: arLaunches,
      purchaseSessions,
    } as AttributionSummary;
  });

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export const getRealTimeAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: recentEvents, error } = await context.supabase
      .from("analytics_events")
      .select("event_type, product_id, created_at, session_id")
      .eq("business_id", context.userId)
      .gte("created_at", fifteenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const list = recentEvents || [];
    const events: Record<string, number> = {};
    const activeSessions = new Set<string>();

    for (const e of list) {
      events[e.event_type] = (events[e.event_type] || 0) + 1;
      if (e.session_id) activeSessions.add(e.session_id);
    }

    return {
      events,
      totalRecent: list.length,
      activeSessions: activeSessions.size,
      timestamp: new Date().toISOString(),
    };
  });
