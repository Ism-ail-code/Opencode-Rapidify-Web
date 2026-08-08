import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { transferRemoteFile, productAssetPath } from "@/lib/storage";
import { z } from "zod";
import { notifyModelReady } from "@/lib/model-notifications";

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

type MatchableJob = {
  id: string;
  product_id: string;
  merchant_id: string;
  business_id: string | null;
  status: string;
  retries: number | null;
  max_retries: number | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
};

/** Finds the job for a provider task by the persisted input.task_id. */
async function findJobByTaskId(provider: string, taskId: string): Promise<MatchableJob | null> {
  // Direct JSONB filter — no scan, works at any queue depth.
  const { data: direct, error: directError } = await supabaseAdmin
    .from("processing_jobs")
    .select("*")
    .eq("provider", provider)
    .eq("input->>task_id", taskId)
    .limit(1);

  if (!directError && direct?.[0]) return direct[0] as MatchableJob;

  // Fallback for legacy rows without a persisted task_id: match output.model_id.
  const { data: jobs } = await supabaseAdmin
    .from("processing_jobs")
    .select("*")
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(200);

  const legacy = (jobs ?? []).find((j) => {
    const out = j.output as Record<string, unknown> | null;
    return out?.model_id === taskId;
  });
  return (legacy as MatchableJob | undefined) ?? null;
}

/**
 * Compare-and-swap: mark the job "ready" only if it is still in flight.
 * Returns false when another path (e.g. the worker poll loop) already did.
 */
async function markJobCompleted(
  jobId: string,
  taskId: string,
  glbUrl: string,
  usdzUrl: string,
  thumbnailUrl: string | null,
  polygonCount: number | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "ready",
      completed_at: now,
      output: { model_id: taskId, glb_url: glbUrl, usdz_url: usdzUrl, thumbnail_url: thumbnailUrl, polygon_count: polygonCount },
      updated_at: now,
    })
    .eq("id", jobId)
    .in("status", ["processing", "optimizing"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[Webhook] Failed to complete job ${jobId}:`, error.message);
    return false;
  }
  return Boolean(updated?.id);
}

async function handleCompletion(params: CompletionParams): Promise<{ ok: boolean; message: string }> {
  const { provider, taskId, status, glbUrl, usdzUrl, thumbnailUrl, polygonCount, errorMessage } = params;

  // 1. Find the matching job. The worker persists input.task_id, so we can
  //    query directly instead of scanning the last 50 rows (which could miss
  //    the job under load). Fall back to the scan only if the direct filter
  //    errors (older rows may predate task_id persistence).
  let matched = await findJobByTaskId(provider, taskId);
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

    // CAS-complete the job. If the worker's poll loop already marked it ready,
    // skip the duplicate email and report it.
    const claimed = await markJobCompleted(matched.id, taskId, finalGlb, finalUsdz, finalThumb, polygonCount);
    console.log(`[Webhook] Job ${matched.id} completed via ${provider}${claimed ? "" : " (already completed by another path)"}`);

    if (!claimed) {
      return { ok: true, message: `Job ${matched.id} already completed` };
    }

    // Send model-ready notification to the product owner (once — we won the CAS).
    await notifyModelReady({
      productId: matched.product_id,
      merchantId: matched.merchant_id,
      businessId: matched.business_id,
    });

    return { ok: true, message: `Job ${matched.id} completed` };
  }

  // FAILED / EXPIRED
  const retries = matched.retries ?? 0;
  const maxRetries = matched.max_retries ?? 5;
  const fail = retries >= maxRetries;
  const nextDelay = Math.pow(2, retries) * 1000 + Math.round(Math.random() * 1000);

  // CAS update: only transition from an in-flight status. If the worker's
  // poll path already resolved the job, don't touch it (and don't re-refund).
  const { data: failedUpdated, error: updateError } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: fail ? "failed" : "queued",
      retries: retries + 1,
      next_retry_at: new Date(Date.now() + nextDelay).toISOString(),
      error: errorMessage ?? `${provider} task ${status}`,
      updated_at: now,
    })
    .eq("id", matched.id)
    .in("status", ["processing", "optimizing"])
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(`[Webhook] Failed to update job ${matched.id} after ${status}:`, updateError.message);
  }

  const claimedFailure = Boolean(failedUpdated?.id);

  // Refund the credit when a billed job exhausts its retries — only if we
  // actually transitioned it (avoids double refunds when the worker's poll
  // path already failed it).
  if (fail && claimedFailure) {
    const input = matched.input as Record<string, unknown>;
    if (input?.billed === true) {
      try {
        await supabaseAdmin.rpc("add_credits", {
          _merchant_id: matched.merchant_id,
          _amount: 1,
          _reason: "processing_job_refund",
          _ref_id: matched.id,
        });
        console.log(`[Webhook] Refunded 1 credit for permanently failed job ${matched.id}`);
      } catch (refundErr) {
        console.error(`[Webhook] Refund failed for job ${matched.id}:`, refundErr instanceof Error ? refundErr.message : refundErr);
      }
    }
  }

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

// ---------------------------------------------------------------------------
// Raw HTTP request handlers — mounted in src/server.ts so provider callbacks
// to /api/webhooks/meshy and /api/webhooks/tripo actually resolve.
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function parseJsonRequest(request: Request): Promise<{ ok: boolean; payload: unknown; error?: string }> {
  if (request.method !== "POST") {
    return { ok: false, payload: null, error: "Method not allowed" };
  }
  const rawBody = await request.text();
  try {
    return { ok: true, payload: JSON.parse(rawBody) };
  } catch {
    return { ok: false, payload: null, error: "Invalid JSON" };
  }
}

export async function handleMeshyWebhookRequest(request: Request): Promise<Response> {
  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, parsed.error === "Invalid JSON" ? 400 : 405);
  }
  try {
    const data = MeshySchema.parse(parsed.payload);
    const result = await handleCompletion({
      provider: "meshy",
      taskId: data.task_id,
      status: data.status,
      glbUrl: data.model_urls?.glb ?? "",
      usdzUrl: data.model_urls?.usdz ?? "",
      thumbnailUrl: data.thumbnail_url ?? null,
      polygonCount: data.polycount ?? null,
      errorMessage: data.message,
    });
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    console.error("[MeshyWebhook] Processing failed:", message);
    return jsonResponse({ error: message }, 400);
  }
}

export async function handleTripoWebhookRequest(request: Request): Promise<Response> {
  const parsed = await parseJsonRequest(request);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, parsed.error === "Invalid JSON" ? 400 : 405);
  }
  try {
    const data = TripoSchema.parse(parsed.payload);
    const statusMap: Record<string, "SUCCEEDED" | "FAILED" | "EXPIRED"> = {
      success: "SUCCEEDED",
      failed: "FAILED",
      cancelled: "EXPIRED",
    };
    const result = await handleCompletion({
      provider: "tripo",
      taskId: data.data.task_id,
      status: statusMap[data.data.status] ?? "FAILED",
      glbUrl: data.data.output?.model ?? "",
      usdzUrl: data.data.output?.model ?? "",
      thumbnailUrl: data.data.output?.rendered_image ?? null,
      polygonCount: data.data.output?.face_count ?? null,
      errorMessage: data.data.message,
    });
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    console.error("[TripoWebhook] Processing failed:", message);
    return jsonResponse({ error: message }, 400);
  }
}
