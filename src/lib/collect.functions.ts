import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Event ingestion — accepts batched or single analytics events.
// Used by the client-side track() function and the embed script.
// ---------------------------------------------------------------------------

const EventSchema = z.object({
  event_type: z.enum([
    "product_view",
    "ar_launch",
    "buy_click",
    "qr_open",
    "embed_open",
    "variant_switch",
    "session_start",
    "page_view",
    "ar_widget_visible",
    "ar_session_end",
    "add_to_cart",
    "purchase_completed",
  ]),
  session_id: z.string().max(128).optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  merchant_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  device_type: z.enum(["desktop", "mobile"]).optional(),
});

const BatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

export const collectEvents = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    // Support both single event and batch
    if (Array.isArray((input as any)?.events)) {
      return BatchSchema.parse(input);
    }
    if ((input as any)?.event_type) {
      return { events: [EventSchema.parse(input)] };
    }
    throw new Error("Invalid payload — expected {events:[...]} or {event_type:...}");
  })
  .handler(async ({ data }) => {
    const productIds = [...new Set(data.events.map((event) => event.product_id).filter((id): id is string => Boolean(id)))];
    if (productIds.length === 0) return { ok: true, accepted: 0 };

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, merchant_id, business_id, status")
      .in("id", productIds)
      .eq("status", "active");
    if (productsError) throw productsError;

    const productMap = new Map((products ?? []).filter((product) => product.business_id).map((product) => [product.id, product]));
    const rows = data.events.flatMap((event) => {
      const product = event.product_id ? productMap.get(event.product_id) : undefined;
      if (!product) return [];
      return [{
        event_type: event.event_type,
        session_id: event.session_id ?? null,
        product_id: product.id,
        merchant_id: product.merchant_id,
        business_id: product.business_id,
        variant_id: event.variant_id ?? null,
        metadata: (event.metadata ?? null) as never,
        user_agent: null as string | null,
      }];
    });

    if (rows.length === 0) return { ok: true, accepted: 0 };

    const { error, count } = await supabaseAdmin
      .from("analytics_events")
      .insert(rows, { count: "exact" });

    if (error) {
      console.error("[Collect] Insert error:", error.message);
      throw new Error("Failed to insert events");
    }

    return { ok: true, accepted: count ?? rows.length };
  });
