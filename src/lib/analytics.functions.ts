import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const eventSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  merchant_id: z.string().uuid().optional().nullable(),
  event_type: z.enum([
    "product_view", "ar_launch", "buy_click", "qr_open", "embed_open",
    "variant_switch", "session_start",
  ]),
  session_id: z.string().max(64).optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => eventSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("analytics_events").insert({
      product_id: data.product_id ?? null,
      merchant_id: data.merchant_id ?? null,
      event_type: data.event_type,
      session_id: data.session_id ?? null,
      variant_id: data.variant_id ?? null,
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
    });
    return { ok: true };
  });

export const getMyAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: events } = await context.supabase
      .from("analytics_events")
      .select("event_type, created_at, product_id")
      .order("created_at", { ascending: false })
      .limit(1000);
    const list = events ?? [];
    const totals: Record<string, number> = {};
    for (const e of list) totals[e.event_type] = (totals[e.event_type] || 0) + 1;
    // daily series for last 14 days
    const days: { day: string; views: number; ar: number; buys: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ day: key.slice(5), views: 0, ar: 0, buys: 0 });
    }
    for (const e of list) {
      const k = new Date(e.created_at).toISOString().slice(5, 10);
      const row = days.find(d => d.day === k);
      if (!row) continue;
      if (e.event_type === "product_view") row.views++;
      if (e.event_type === "ar_launch") row.ar++;
      if (e.event_type === "buy_click") row.buys++;
    }
    return { totals, days, recent: list.slice(0, 20) };
  });

export const getMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("processing_jobs")
      .select("id, status, provider, created_at, updated_at, product_id, error")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
