import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { transferRemoteFile, productAssetPath } from "@/lib/storage";
import { z } from "zod";
import { sendModelReadyEmail } from "@/lib/email.functions";

// ---------------------------------------------------------------------------
// Shared completion logic (used by both Meshy and Tripo webhooks)
// ---------------------------------------------------------------------------
interface CompletionParams {
  provider: string;
  taskId: string;
  status: "SUCCEEDED" | "FAILED" | "EXPIRED";
  glbUrl: string;
  usdzUrl: string;
  thumbnailUrl: string | null;
  polygonCount: number | null;
  errorMessage?: string;
}

async function handleCompletion(params: CompletionParams): Promise<{ ok: boolean; message: string }> {
  const { provider, taskId, status, glbUrl, usdzUrl, thumbnailUrl, polygonCount, errorMessage } = params;

  // 1. Find matching processing job
  const { data: jobs } = await supabaseAdmin
    .from("processing_jobs")
    .select("*")
    .eq("provider", provider)
    .eq("status", "processing")
    .order("created_at", { ascending: false })
    .limit(50);

  const matched = (jobs ?? []).find((j) => {
    const inp = j.input as Record<string, unknown>;
    const out = j.output as Record<string, unknown> | null;
    return inp?.task_id === taskId || out?.model_id === taskId;
  });

  if (!matched) {
    console.warn(`[Webhook] No matching job for ${provider} task ${taskId}`);
    return { ok: true, message: "No matching job — acknowledged" };
  }

  if (!matched.merchant_id) throw new Error("No merchant_id associated with processing job");
  if (!matched.product_id) throw new Error("No product_id associated with processing job");

  const now = new Date().toISOString();

  if (status === "SUCCEEDED") {
    let finalGlb = glbUrl;
    let finalUsdz = usdzUrl;
    let finalThumb = thumbnailUrl;

    // Transfer GLB
    if (glbUrl) {
      try {
        const dest = productAssetPath(matched.merchant_id, matched.product_id, null, "glb");
        const { fullUrl } = await transferRemoteFile("models", dest, glbUrl);
        finalGlb = fullUrl;
      } catch (e) { console.error("[Webhook] GLB transfer error:", e); }
    }

    // Transfer USDZ
    if (usdzUrl && usdzUrl !== glbUrl) {
      try {
        const dest = productAssetPath(matched.merchant_id, matched.product_id, null, "usdz");
        const { fullUrl } = await transferRemoteFile("models", dest, usdzUrl);
        finalUsdz = fullUrl;
      } catch (e) { console.error("[Webhook] USDZ transfer error:", e); }
    }

    // Transfer thumbnail
    if (finalThumb) {
      try {
        const dest = `${matched.merchant_id}/products/${matched.product_id}/thumb.jpg`;
        const { fullUrl } = await transferRemoteFile("thumbnails", dest, finalThumb);
        finalThumb = fullUrl;
      } catch (e) { console.error("[Webhook] Thumb transfer error:", e); }
    }

    // Update product
    const upd: { model_glb_url?: string | null; model_usdz_url?: string | null; thumbnail_url?: string | null } = {};
    if (finalGlb) upd.model_glb_url = finalGlb;
    if (finalUsdz) upd.model_usdz_url = finalUsdz;
    if (finalThumb) upd.thumbnail_url = finalThumb;
    if (Object.keys(upd).length) {
      await supabaseAdmin.from("products").update(upd).eq("id", matched.product_id);
    }

    // Upsert into models table
    if (matched.business_id && (finalGlb || finalUsdz)) {
      const { error: modelError } = await supabaseAdmin.from("models").upsert({
        business_id: matched.business_id,
        product_id: matched.product_id,
        model_url: finalGlb || null,
        usdz_url: finalUsdz || null,
        status: "ready",
      }, { onConflict: "business_id,product_id" });
      if (modelError) {
        console.error(`[Webhook] Failed to mark model ready for ${matched.product_id}:`, modelError.message);
      }
    }

    // Mark job ready
    await supabaseAdmin
      .from("processing_jobs")
      .update({
        status: "ready",
        completed_at: now,
        output: { model_id: taskId, glb_url: finalGlb, usdz_url: finalUsdz, thumbnail_url: finalThumb, polygon_count: polygonCount },
        updated_at: now,
      })
      .eq("id", matched.id);

    console.log(`[Webhook] Job ${matched.id} completed via ${provider}`);

    // Send model-ready notification to the product owner
    try {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("title, merchant_id")
        .eq("id", matched.product_id)
        .single();

      if (product?.merchant_id) {
        const { data: ownerProfile } = await supabaseAdmin
          .from("business_profiles")
          .select("business_email, representative_name")
          .eq("id", matched.business_id ?? matched.merchant_id)
          .maybeSingle();

        if (ownerProfile?.business_email) {
          sendModelReadyEmail({
            data: {
              email: ownerProfile.business_email,
              name: ownerProfile.representative_name ?? "Merchant",
              productName: product.title,
              productId: matched.product_id,
            },
          }).catch((err) => {
            console.error("[Webhook] Failed to send model-ready email", err);
          });
        }
      }
    } catch (emailErr) {
      console.error("[Webhook] Failed to resolve owner for email notification", emailErr);
    }

    return { ok: true, message: `Job ${matched.id} completed` };
  }

  // FAILED / EXPIRED
  const retries = matched.retries ?? 0;
  const maxRetries = matched.max_retries ?? 5;
  const fail = retries >= maxRetries;
  const nextDelay = Math.pow(2, retries) * 1000;

  await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: fail ? "failed" : "queued",
      retries: retries + 1,
      next_retry_at: new Date(Date.now() + nextDelay).toISOString(),
      error: errorMessage ?? `${provider} task ${status}`,
      updated_at: now,
    })
    .eq("id", matched.id);

  console.log(`[Webhook] Job ${matched.id} ${status} — ${fail ? "permanently failed" : `retry ${retries + 1}/${maxRetries}`}`);
  return { ok: true, message: `Job ${matched.id} ${status}` };
}

// ---------------------------------------------------------------------------
// Meshy webhook — POST /api/webhooks/meshy
// Docs: https://docs.meshy.ai/api-integration/webhooks
// ---------------------------------------------------------------------------
const MeshySchema = z.object({
  task_id: z.string(),
  status: z.enum(["SUCCEEDED", "FAILED", "EXPIRED"]),
  model_urls: z.object({
    glb: z.string().url().optional(),
    usdz: z.string().url().optional(),
  }).optional(),
  thumbnail_url: z.string().url().optional().nullable(),
  polycount: z.number().optional().nullable(),
  message: z.string().optional(),
});

export const handleMeshyWebhook = createServerFn({ method: "POST" })
  .validator((input: unknown) => MeshySchema.parse(input))
  .handler(async ({ data }) => {
    return handleCompletion({
      provider: "meshy",
      taskId: data.task_id,
      status: data.status,
      glbUrl: data.model_urls?.glb ?? "",
      usdzUrl: data.model_urls?.usdz ?? "",
      thumbnailUrl: data.thumbnail_url ?? null,
      polygonCount: data.polycount ?? null,
      errorMessage: data.message,
    });
  });

// ---------------------------------------------------------------------------
// Tripo webhook — POST /api/webhooks/tripo
// Docs: https://platform.tripo3d.ai/docs/api-reference
// ---------------------------------------------------------------------------
const TripoSchema = z.object({
  type: z.literal("task_update"),
  data: z.object({
    task_id: z.string(),
    status: z.enum(["success", "failed", "cancelled"]),
    output: z.object({
      model: z.string().url().optional(),
      rendered_image: z.string().url().optional().nullable(),
      face_count: z.number().optional().nullable(),
    }).optional(),
    message: z.string().optional(),
  }),
});

export const handleTripoWebhook = createServerFn({ method: "POST" })
  .validator((input: unknown) => TripoSchema.parse(input))
  .handler(async ({ data }) => {
    const statusMap: Record<string, "SUCCEEDED" | "FAILED" | "EXPIRED"> = {
      success: "SUCCEEDED",
      failed: "FAILED",
      cancelled: "EXPIRED",
    };

    return handleCompletion({
      provider: "tripo",
      taskId: data.data.task_id,
      status: statusMap[data.data.status] ?? "FAILED",
      glbUrl: data.data.output?.model ?? "",
      usdzUrl: data.data.output?.model ?? "",
      thumbnailUrl: data.data.output?.rendered_image ?? null,
      polygonCount: data.data.output?.face_count ?? null,
      errorMessage: data.data.message,
    });
  });
