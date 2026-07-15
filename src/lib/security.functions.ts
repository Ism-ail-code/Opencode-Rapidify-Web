import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";

type RateLimitStore = Map<string, { count: number; resetAt: number }>;
const rateLimitStore: RateLimitStore = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 60000;

let cleanupStarted = false;

function startCleanupIfNeeded() {
  if (cleanupStarted || typeof setInterval === "undefined") return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt < now) rateLimitStore.delete(key);
    }
  }, RATE_LIMIT_CLEANUP_INTERVAL);
}

export function getRateLimitKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`;
}

export function checkRateLimit(
  key: string,
  maxRequests: number = 100,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetAt: number } {
  startCleanupIfNeeded();
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count += 1;
  const allowed = entry.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

export const rateLimitMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Access the underlying web request to extract IP and path.
  // getRequest() is available only on the server inside a server function context.
  let ip = "unknown";
  let endpoint = "/";
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    ip = req.headers.get("x-forwarded-for") ?? "unknown";
    endpoint = new URL(req.url).pathname;
  } catch {
    // Not in a server-fn context — skip rate limiting.
    return await next();
  }

  const publicEndpoints = ["/p/", "/embed/", "/api/track"];
  const isPublicEndpoint = publicEndpoints.some(e => endpoint.startsWith(e));

  const limits = isPublicEndpoint
    ? { max: 30, window: 60000 }
    : { max: 200, window: 60000 };

  const key = getRateLimitKey(ip, endpoint);
  const result = checkRateLimit(key, limits.max, limits.window);

  if (!result.allowed) {
    throw new Error("Too many requests. Please try again later.");
  }

  return await next();
});

/**
 * Validates data against a Zod schema.
 * Note: This runs server-side only. The schema must be resolved
 * on the server, not passed from the client.
 */
const SCHEMA_REGISTRY = {
  string: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  email: z.string().email(),
  uuid: z.string().uuid(),
  url: z.string().url(),
} as const;

export const validateInput = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schemaName: z.string(),
    data: z.any(),
  }).parse(d))
  .handler(async ({ data }) => {
    try {
      const schema = SCHEMA_REGISTRY[data.schemaName as keyof typeof SCHEMA_REGISTRY];
      if (!schema) {
        throw new Error(`Unknown schema: ${data.schemaName}`);
      }
      const validated = schema.parse(data.data);
      return { valid: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => ({
            path: e.path.join("."),
            message: e.message,
          })),
        };
      }
      throw error;
    }
  });

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

export async function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);

    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      console.error("[Security] crypto.subtle unavailable — webhook signature verification skipped (insecure)");
      return false;
    }

    const key = await subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return await subtle.verify("HMAC", key, hexToBytes(signature) as unknown as BufferSource, messageData as unknown as BufferSource);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export const preventReplayAttack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    timestamp: z.number(),
    nonce: z.string().min(8).max(64),
    maxAge: z.number().default(300000),
  }).parse(d))
  .handler(async ({ data }) => {
    const now = Date.now();
    const age = now - data.timestamp;

    if (Math.abs(age) > data.maxAge) {
      throw new Error("Request expired");
    }

    const nonceKey = `nonce:${data.nonce}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("used_nonces")
      .select("id")
      .eq("nonce", data.nonce)
      .maybeSingle();

    if (existing) {
      throw new Error("Nonce already used");
    }

    await supabaseAdmin
      .from("used_nonces")
      .insert({ nonce: data.nonce, expires_at: new Date(now + data.maxAge).toISOString() });

    return { valid: true };
  });

export const auditLog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    action: z.string().min(1).max(100),
    resource: z.string().min(1).max(100),
    resourceId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      action: data.action,
      resource: data.resource,
      resource_id: data.resourceId || null,
      metadata: (data.metadata || {}) as never,
      ip_address: (context as any)?.request?.headers?.get("x-forwarded-for") || null,
      created_at: new Date().toISOString(),
    });
    return { logged: true };
  });

export const validateTenantAccess = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    merchantId: z.string().uuid(),
    resourceType: z.enum(["products", "analytics", "jobs"]),
    resourceId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any)?.userId;
    if (!userId) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .eq("id", data.merchantId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (!merchant) throw new Error("Tenant access denied");

    return { authorized: true, merchantId: merchant.id };
  });
