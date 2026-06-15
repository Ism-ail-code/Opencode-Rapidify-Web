import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getConversionFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
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
      if (e.event_type in funnel) {
        funnel[e.event_type as keyof typeof funnel]++;
      }
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

export const getCohortAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
    limit: z.number().int().min(1).max(52).default(12),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at, session_id")
      .order("created_at", { ascending: false })
      .limit(10000);

    const list = events || [];
    const cohorts: Record<string, { views: number; ar: number; buys: number; sessions: Set<string> }> = {};
    const now = new Date();

    for (const e of list) {
      const date = new Date(e.created_at);
      let periodKey: string;

      switch (data.period) {
        case "daily":
          periodKey = date.toISOString().slice(0, 10);
          break;
        case "weekly": {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          periodKey = startOfWeek.toISOString().slice(0, 10);
          break;
        }
        case "monthly":
          periodKey = date.toISOString().slice(0, 7);
          break;
        default:
          periodKey = date.toISOString().slice(0, 10);
      }

      if (!cohorts[periodKey]) {
        cohorts[periodKey] = { views: 0, ar: 0, buys: 0, sessions: new Set() };
      }

      const cohort = cohorts[periodKey];
      if (e.event_type === "product_view") cohort.views++;
      if (e.event_type === "ar_launch") cohort.ar++;
      if (e.event_type === "buy_click") cohort.buys++;
      if (e.session_id) cohort.sessions.add(e.session_id);
    }

    const sorted = Object.entries(cohorts)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, data.limit)
      .map(([period, stats]) => ({
        period,
        views: stats.views,
        ar: stats.ar,
        buys: stats.buys,
        sessions: stats.sessions.size,
      }));

    return sorted;
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
      ? await supabaseAdmin
          .from("products")
          .select("id, title, slug, thumbnail_url, price_cents, currency")
          .in("id", productIds)
      : { data: [] };

    const productMap = new Map((products || []).map(p => [p.id, p]));

    const result = Object.values(productStats).map(stat => {
      const product = productMap.get(stat.product_id);
      return {
        productId: stat.product_id,
        title: product?.title || "Unknown",
        slug: product?.slug || "",
        thumbnail: product?.thumbnail_url || null,
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

export const getRealTimeAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: recentEvents, error } = await context.supabase
      .from("analytics_events")
      .select("event_type, product_id, created_at, session_id")
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

export const getAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff7 = new Date(); cutoff7.setDate(cutoff7.getDate() - 7);
    const cutoff1 = new Date(); cutoff1.setDate(cutoff1.getDate() - 1);

    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at")
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