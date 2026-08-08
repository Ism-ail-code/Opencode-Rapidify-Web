import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_COSTS } from "@/lib/credits.functions";

/**
 * Queues a 3D generation job for a product the caller owns.
 *
 * This is the explicit "Generate with AI" action — the caller (product form)
 * has already saved the product and uploaded a thumbnail, which becomes the
 * provider's source image. One credit is deducted; it is refunded if the job
 * permanently fails (handled by the worker/webhook refund path).
 */
export const enqueueAiGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ product_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // 1. Ownership + state checks (user-scoped client → RLS enforced)
    const { data: product, error: productError } = await context.supabase
      .from("products")
      .select("id, merchant_id, model_glb_url, model_usdz_url, thumbnail_url")
      .eq("id", data.product_id)
      .eq("business_id", userId)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) throw new Error("Product not found");

    if (product.model_glb_url || product.model_usdz_url) {
      throw new Error("This product already has a 3D model");
    }
    if (!product.thumbnail_url) {
      throw new Error("Upload a product thumbnail first — it is used as the 3D source image");
    }

    // 2. Don't stack jobs — one in-flight generation per product.
    const { data: inFlight } = await context.supabase
      .from("processing_jobs")
      .select("id")
      .eq("product_id", data.product_id)
      .in("status", ["queued", "processing", "optimizing"])
      .limit(1);
    if (inFlight && inFlight.length > 0) {
      throw new Error("A generation job is already running for this product");
    }

    // 3. Deduct the credit before queueing.
    const { data: ok } = await context.supabase.rpc("deduct_credits", {
      _merchant_id: product.merchant_id,
      _amount: CREDIT_COSTS.processing_job,
      _reason: "processing_job",
      _ref_id: product.id,
    });
    if (!ok) throw new Error("Insufficient credits for 3D generation");

    // 4. Queue the job with the configured default provider.
    const { getDefaultProvider } = await import("@/lib/config.server");
    const { data: job, error: jobError } = await context.supabase
      .from("processing_jobs")
      .insert({
        product_id: product.id,
        merchant_id: product.merchant_id,
        business_id: userId,
        provider: getDefaultProvider(),
        status: "queued",
        input: {
          source: "ai_generation",
          image_url: product.thumbnail_url,
          billed: true,
        },
        retries: 0,
        max_retries: 5,
        next_retry_at: new Date(Date.now() + 1000).toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      // Roll back the deduction so an enqueue failure never costs a credit.
      try {
        await context.supabase.rpc("add_credits", {
          _merchant_id: product.merchant_id,
          _amount: CREDIT_COSTS.processing_job,
          _reason: "processing_job_refund",
          _ref_id: product.id,
        });
      } catch {
        // refund best-effort; never mask the original error
      }
      throw jobError;
    }

    return { job, provider: job.provider };
  });
