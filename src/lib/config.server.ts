import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,

    // Supabase
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,

    // AI providers
    meshyApiUrl: process.env.MESHY_API_URL ?? "https://api.meshy.ai",
    meshyApiKey: process.env.MESHY_API_KEY,
    tripoApiUrl: process.env.TRIPO_API_URL ?? "https://api.tripo3d.ai/v2/openapi",
    tripoApiKey: process.env.TRIPO_API_KEY,

    // Webhook base URL (for callbacks from AI providers)
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000",

    // App URL (public, for OG images, deep links, etc.)
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
  };
}

/**
 * Validate that all required environment variables are set.
 * Call this on server startup to fail fast.
 */
export function validateEnv(): void {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY"] as const;
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error(`[Config] Missing required env vars: ${missing.join(", ")}`);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Warn about optional but recommended vars
  const optional = ["MESHY_API_KEY", "TRIPO_API_KEY", "WEBHOOK_BASE_URL"] as const;
  for (const key of optional) {
    if (!process.env[key]) {
      console.warn(`[Config] ${key} not set — provider ${key.replace("_API_KEY", "").toLowerCase()} will be unavailable`);
    }
  }
}
