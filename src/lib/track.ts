import { trackEvent } from "@/lib/embed.functions";

function sid() {
  if (typeof window === "undefined") return null;
  let s = sessionStorage.getItem("rdf_sid");
  if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("rdf_sid", s); }
  return s;
}

type EventName =
  | "product_view"
  | "page_view"
  | "ar_widget_visible"
  | "ar_launch"
  | "ar_session_end"
  | "add_to_cart"
  | "purchase_completed"
  | "buy_click"
  | "qr_open"
  | "embed_open"
  | "variant_switch"
  | "session_start";

export function track(event: EventName, opts: {
  product_id?: string | null; merchant_id?: string | null; variant_id?: string | null;
  metadata?: Record<string, unknown>;
} = {}) {
  try {
    void trackEvent({ data: { event_type: event, session_id: sid(), ...opts } });
  } catch { /* ignore */ }
}
