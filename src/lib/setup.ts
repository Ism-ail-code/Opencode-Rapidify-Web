/**
 * Setup script — run once on deployment to initialize infrastructure.
 * Usage: npm run setup
 *
 * This will:
 * 1. Validate environment variables
 * 2. Create Supabase storage buckets if they don't exist
 * 3. Verify database connectivity
 */

import { validateEnv } from "./config.server";
import { ensureBuckets } from "./storage";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function setup() {
  console.log("=".repeat(60));
  console.log("[Setup] AR Commerce Platform — Initial Setup");
  console.log("=".repeat(60));

  // 1. Validate env
  console.log("\n[1/3] Validating environment variables...");
  try {
    validateEnv();
    console.log("  ✓ Environment variables OK");
  } catch (err) {
    console.error("  ✗ Environment validation failed:", err);
    process.exit(1);
  }

  // 2. Ensure storage buckets
  console.log("\n[2/3] Setting up storage buckets...");
  try {
    await ensureBuckets();
    console.log("  ✓ Storage buckets verified");
  } catch (err) {
    console.error("  ✗ Storage setup failed:", err);
    console.error("    Non-fatal — you can create buckets manually in the Supabase dashboard");
  }

  // 3. Verify database connectivity
  console.log("\n[3/3] Verifying database connectivity...");
  try {
    const { error } = await supabaseAdmin.from("merchants").select("id").limit(1);
    if (error) throw error;
    console.log("  ✓ Database connection OK");
  } catch (err) {
    console.error("  ✗ Database connection failed:", err);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("[Setup] All checks passed! The platform is ready.");
  console.log("=".repeat(60));
  console.log("\nNext steps:");
  console.log("  1. Start the dev server:  npm run dev");
  console.log("  2. Start the worker:      npm run worker");
  console.log("  3. Open http://localhost:3000");
  console.log("");
  console.log("For production:");
  console.log("  - Deploy the worker as a separate service or cron job");
  console.log("  - Set WEBHOOK_BASE_URL to your public domain");
  console.log("  - Configure AI provider API keys (MESHY_API_KEY, TRIPO_API_KEY)");
  console.log("");
}

setup().catch((err) => {
  console.error("[Setup] Fatal error:", err);
  process.exit(1);
});
