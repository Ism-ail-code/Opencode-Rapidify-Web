import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Store URL validation
// ---------------------------------------------------------------------------

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    // Accept any 2xx or 3xx response as reachable
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook connectivity check
// Sends a lightweight ping payload to the merchant's configured webhook URL
// to verify the endpoint is reachable. Does NOT create any real data.
// ---------------------------------------------------------------------------

async function verifyWebhookConnectivity(webhookUrl: string): Promise<{ ok: boolean; message: string }> {
  if (!webhookUrl || !isValidUrl(webhookUrl)) {
    return { ok: false, message: "Invalid webhook URL" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Rapidify-Verification/1.0" },
      body: JSON.stringify({
        event: "ping",
        timestamp: Date.now(),
        source: "rapidify-verification",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { ok: res.status >= 200 && res.status < 500, message: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

// ---------------------------------------------------------------------------
// Server function: verify store URL
// ---------------------------------------------------------------------------

export const verifyStoreUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string() }).parse(d))
  .handler(async ({ data }) => {
    if (!isValidUrl(data.url)) {
      return { valid: false, reachable: false, message: "Invalid URL format" };
    }

    const reachable = await isUrlReachable(data.url);
    return { valid: true, reachable, message: reachable ? "URL is reachable" : "URL is valid but not reachable" };
  });

// ---------------------------------------------------------------------------
// Server function: verify webhook endpoint
// ---------------------------------------------------------------------------

export const verifyWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ webhook_url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    return await verifyWebhookConnectivity(data.webhook_url);
  });

// ---------------------------------------------------------------------------
// Exported utility functions (used by onboarding handler)
// ---------------------------------------------------------------------------

export { isValidUrl, isUrlReachable, verifyWebhookConnectivity };
