import { loadEnvFile } from "../src/workers/load-env";
loadEnvFile();

import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { runWorker } from "../src/workers/job-worker";

async function main() {
  const merchantId = "11111111-1111-1111-1111-111111111111"; // demo merchant

  // business_id must be a real auth user (FK). Prefer one WITH a
  // business_profiles row so the notifyModelReady email path is exercised
  // (email is temporarily redirected, see below); fall back to any user.
  const { data: users, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (usersErr) throw usersErr;
  const { data: profiles } = await supabaseAdmin.from("business_profiles").select("id");
  const profileIds = new Set((profiles ?? []).map((p) => p.id));
  const candidate = (users.users ?? []).find((u) => profileIds.has(u.id)) ?? users.users?.[0];
  if (!candidate) throw new Error("No auth users found");
  const businessId = candidate.id;
  console.log("[smoke] using business_id", businessId, "email:", candidate.email);

  // If the user HAS a profile, temporarily point it at an undeliverable
  // address so the full notifyModelReady -> sendEmail path is exercised
  // without sending a real email. Restored in the finally block.
  const { data: profileRow } = await supabaseAdmin
    .from("business_profiles")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  const origEmail = profileRow?.business_email;
  if (profileRow) {
    const { error } = await supabaseAdmin
      .from("business_profiles")
      .update({ business_email: `smoke+${Date.now()}@invalid` })
      .eq("id", businessId);
    if (error) throw error;
    console.log("[smoke] owner profile email temporarily redirected (.invalid — nothing will be delivered)");
  }

  let jobId: string | null = null;
  let productId: string | null = null;
  try {
    // 1. Create a throwaway product
    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .insert({
        merchant_id: merchantId,
        business_id: businessId,
        title: "PIPELINE SMOKE TEST",
        slug: `smoke-${Date.now().toString(36)}`,
        price_cents: 0,
        currency: "USD",
        status: "draft",
        thumbnail_url: "https://example.com/source.jpg",
      })
      .select("id")
      .single();
    if (prodErr) throw prodErr;
    productId = product.id;
    console.log("[smoke] created product", product.id);

    // 2. Enqueue a simulated job (as enqueueAiGeneration would)
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("processing_jobs")
      .insert({
        product_id: product.id,
        merchant_id: merchantId,
        business_id: businessId,
        provider: "simulated",
        status: "queued",
        input: { source: "smoke_test", image_url: "https://example.com/source.jpg", billed: true },
        retries: 0,
        max_retries: 5,
        next_retry_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (jobErr) throw jobErr;
    jobId = job.id;
    console.log("[smoke] enqueued job", job.id, "provider:", job.provider);

    // 3. Run one worker cycle
    console.log("[smoke] running worker cycle...");
    await runWorker();

    // 4. Verify terminal state
    const { data: after } = await supabaseAdmin
      .from("processing_jobs")
      .select("status, output, error")
      .eq("id", job.id)
      .single();
    console.log("[smoke] job status after worker:", after?.status);
    console.log("[smoke] job output:", JSON.stringify(after?.output ?? null));
    console.log("[smoke] job error:", after?.error ?? null);

    const { data: prodAfter } = await supabaseAdmin
      .from("products")
      .select("model_glb_url, model_usdz_url")
      .eq("id", product.id)
      .single();
    console.log("[smoke] product model urls:", JSON.stringify({ glb: prodAfter?.model_glb_url, usdz: prodAfter?.model_usdz_url }));

    const ok = after?.status === "ready";
    console.log("[smoke] RESULT:", ok ? "PASS" : "FAIL");
    return ok ? 0 : 1;
  } finally {
    // 5. Cleanup
    if (productId) {
      const { error: delErr } = await supabaseAdmin.from("products").delete().eq("id", productId);
      console.log("[smoke] cleanup:", delErr ? "FAILED " + delErr.message : "ok (product + jobs cascade-deleted)");
    }
    if (profileRow && origEmail !== undefined) {
      const { error: restoreErr } = await supabaseAdmin
        .from("business_profiles")
        .update({ business_email: origEmail })
        .eq("id", businessId);
      console.log(
        restoreErr
          ? "[smoke] FAILED to restore profile email: " + restoreErr.message
          : "[smoke] owner profile email restored",
      );
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[smoke] ERROR:", err.message);
    process.exit(1);
  });
