import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) {
      return {
        totalEvents: 0, last7Days: 0, last24Hours: 0, byType: {},
        period: { from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date().toISOString() },
      };
    }

    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff7 = new Date(); cutoff7.setDate(cutoff7.getDate() - 7);
    const cutoff1 = new Date(); cutoff1.setDate(cutoff1.getDate() - 1);

    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("merchant_id", merchant.id)
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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return { totals: {}, days: [], recent: [] };

    const fourteenDaysAgo = new Date(); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("merchant_id", merchant.id)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    const list = events || [];
    const totals: Record<string, number> = { product_view: 0, ar_launch: 0, buy_click: 0 };
    const dayMap: Record<string, { day: string; views: number; ar: number; buys: number }> = {};

    for (const e of list) {
      if (e.event_type in totals) totals[e.event_type]++;
      const dayKey = new Date(e.created_at).toISOString().slice(0, 10);
      if (!dayMap[dayKey]) dayMap[dayKey] = { day: dayKey, views: 0, ar: 0, buys: 0 };
      if (e.event_type === "product_view") dayMap[dayKey].views++;
      if (e.event_type === "ar_launch") dayMap[dayKey].ar++;
      if (e.event_type === "buy_click") dayMap[dayKey].buys++;
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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return [];

    const { data, error } = await context.supabase
      .from("processing_jobs")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  });

export const getConversionFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) {
      return { funnel: { product_view: 0, ar_launch: 0, buy_click: 0, qr_open: 0, embed_open: 0, variant_switch: 0 }, conversionRate: "0.0%", totalEvents: 0 };
    }

    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("merchant_id", merchant.id)
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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - data.days);

    let query = context.supabase
      .from("analytics_events")
      .select("event_type, product_id, created_at, session_id")
      .eq("merchant_id", merchant.id)
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
    const { data: products } = productIds.length > 0
      ? await import("@/integrations/supabase/client.server").then(m => m.supabaseAdmin)
          .from("products")
          .select("id, title, slug, price_cents, currency")
          .in("id", productIds)
      : { data: [] };

    const productMap = new Map((products || []).map(p => [p.id, p]));

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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) {
      return {
        totalViews: 0, arLaunches: 0, arEngagementRate: "0.0",
        addToCartAfterAr: 0, conversionRateAfterAr: "0.0",
        estimatedRevenueInfluenced: 0, avgArSessionDuration: "0s",
        totalSessions: 0, arSessions: 0, purchaseSessions: 0,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sessions } = await supabaseAdmin
      .from("attribution_sessions")
      .select("*")
      .eq("merchant_id", merchant.id)
      .gte("last_seen_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const list: Array<{
      had_page_view: boolean;
      had_ar_widget: boolean;
      had_ar_launch: boolean;
      had_add_to_cart: boolean;
      had_purchase: boolean;
      revenue_cents: number;
      ar_session_duration_seconds: number;
    }> = (sessions ?? []) as any;

    const totalViews = list.filter(s => s.had_page_view).length;
    const arSessionRows = list.filter(s => s.had_ar_launch);
    const arLaunches = arSessionRows.length;
    const addToCartAfterAr = arSessionRows.filter(s => s.had_add_to_cart).length;
    const purchaseSessions = arSessionRows.filter(s => s.had_purchase).length;
    const totalRevenue = arSessionRows.reduce((sum, s) => sum + (s.revenue_cents ?? 0), 0);
    const totalArDuration = arSessionRows.reduce((sum, s) => sum + (s.ar_session_duration_seconds ?? 0), 0);

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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) {
      return { events: {}, totalRecent: 0, activeSessions: 0, timestamp: new Date().toISOString() };
    }

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: recentEvents, error } = await context.supabase
      .from("analytics_events")
      .select("event_type, product_id, created_at, session_id")
      .eq("merchant_id", merchant.id)
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
