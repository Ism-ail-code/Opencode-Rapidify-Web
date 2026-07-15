import { supabaseAdmin } from "../integrations/supabase/client.server";
import { transferRemoteFile, productAssetPath } from "../lib/storage";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const JOB_TIMEOUT_MS = 60_000; // 60 seconds per job
const MAX_CONCURRENT_JOBS = 5;

const MESHY_API_URL = process.env.MESHY_API_URL ?? "https://api.meshy.ai";
const MESHY_API_KEY = process.env.MESHY_API_KEY ?? "";
const TRIPO_API_URL = process.env.TRIPO_API_URL ?? "https://api.tripo3d.ai/v2/openapi";
const TRIPO_API_KEY = process.env.TRIPO_API_KEY ?? "";
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ProcessingJob {
  business_id: string | null;
  id: string;
  product_id: string;
  merchant_id: string;
  provider: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  retries: number;
  max_retries: number;
  next_retry_at: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

interface ProviderResult {
  model_id: string;
  status: string;
  glb_url: string;
  usdz_url: string;
  thumbnail_url: string | null;
  polygon_count: number | null;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
async function getJobsToProcess(limit: number = MAX_CONCURRENT_JOBS): Promise<ProcessingJob[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("next_retry_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[Worker] Error fetching jobs:", error.message);
    return [];
  }

  return (data ?? []) as ProcessingJob[];
}

async function acquireJob(jobId: string): Promise<ProcessingJob | null> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({ status: "processing", started_at: now, updated_at: now })
    .eq("id", jobId)
    .eq("status", "queued")
    .select()
    .single();

  if (error || !data) return null;
  return data as ProcessingJob;
}

async function completeJob(jobId: string, result: ProviderResult): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "ready",
      completed_at: now,
      output: result as never,
      updated_at: now,
    })
    .eq("id", jobId);

  if (error) console.error(`[Worker] Error completing job ${jobId}:`, error.message);
}

async function markOptimizing(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("processing_jobs")
    .update({ status: "optimizing", updated_at: now })
    .eq("id", jobId);
}

async function failJob(
  jobId: string,
  errorMessage: string,
  job: ProcessingJob,
): Promise<void> {
  const now = new Date();
  const shouldFail = job.retries >= job.max_retries;
  const nextDelay = Math.pow(2, job.retries) * 1000;
  const nextRetryAt = new Date(now.getTime() + nextDelay);

  const { error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: shouldFail ? "failed" : "queued",
      retries: job.retries + 1,
      next_retry_at: nextRetryAt.toISOString(),
      error: errorMessage,
      updated_at: now.toISOString(),
    })
    .eq("id", jobId);

  if (error) console.error(`[Worker] Error failing job ${jobId}:`, error.message);
}

// ---------------------------------------------------------------------------
// Meshy AI integration
// https://docs.meshy.ai/api-integration
// ---------------------------------------------------------------------------
async function createMeshyTask(input: Record<string, unknown>): Promise<string> {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks/meshy`;

  const response = await fetch(`${MESHY_API_URL}/v1/image-to-3d`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MESHY_API_KEY}`,
    },
    body: JSON.stringify({
      image_url: input.image_url,
      prompt: input.prompt ?? "High quality 3D model",
      enable_pbr: input.enable_pbr ?? true,
      topology: input.topology ?? "triangle",
      target_polycount: input.target_polycount ?? 30000,
      webhook_url: webhookUrl,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Meshy create task failed (${response.status}): ${errBody}`);
  }

  const body = await response.json();
  return body.result; // task ID
}

async function pollMeshyTask(
  taskId: string,
  timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<ProviderResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${MESHY_API_URL}/v1/image-to-3d/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Meshy poll failed (${response.status}): ${errBody}`);
    }

    const body = await response.json();
    const task = body.result;

    if (task.status === "SUCCEEDED") {
      return {
        model_id: taskId,
        status: "completed",
        glb_url: task.model_urls?.glb ?? "",
        usdz_url: task.model_urls?.usdz ?? "",
        thumbnail_url: task.thumbnail_url ?? null,
        polygon_count: task.polycount ?? null,
      };
    }

    if (task.status === "FAILED" || task.status === "EXPIRED") {
      throw new Error(`Meshy task ${taskId} ${task.status}: ${task.message ?? "unknown error"}`);
    }

    // Still processing — wait before next poll
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Meshy task ${taskId} timed out after ${timeoutMs}ms`);
}

async function processMeshyJob(job: ProcessingJob): Promise<ProviderResult> {
  if (!MESHY_API_KEY) throw new Error("MESHY_API_KEY not configured");

  const taskId = await createMeshyTask(job.input);
  console.log(`[Worker] Meshy task created: ${taskId}`);

  await markOptimizing(job.id);
  return pollMeshyTask(taskId);
}

// ---------------------------------------------------------------------------
// Tripo3D AI integration
// https://platform.tripo3d.ai/docs/api-reference
// ---------------------------------------------------------------------------
async function createTripoTask(input: Record<string, unknown>): Promise<string> {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/webhooks/tripo`;

  const response = await fetch(`${TRIPO_API_URL}/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIPO_API_KEY}`,
    },
    body: JSON.stringify({
      type: "image_to_model",
      file: { type: "jpg", url: input.image_url },
      model_version: input.model_version ?? "v2.0-20240919",
      webhook: {
        url: webhookUrl,
        id: `tripo_${Date.now()}`,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Tripo create task failed (${response.status}): ${errBody}`);
  }

  const body = await response.json();
  if (body.code !== 0) {
    throw new Error(`Tripo API error: ${body.message ?? JSON.stringify(body)}`);
  }

  return body.data.task_id;
}

async function pollTripoTask(
  taskId: string,
  timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<ProviderResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${TRIPO_API_URL}/task/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Tripo poll failed (${response.status}): ${errBody}`);
    }

    const body = await response.json();
    const task = body.data;

    if (task.status === "success") {
      return {
        model_id: taskId,
        status: "completed",
        glb_url: task.output?.model ?? "",
        usdz_url: task.output?.model ?? "", // Tripo generates GLB; USDZ conversion handled separately if needed
        thumbnail_url: task.output?.rendered_image ?? null,
        polygon_count: task.output?.face_count ?? null,
      };
    }

    if (task.status === "failed") {
      throw new Error(`Tripo task ${taskId} failed: ${task.message ?? "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Tripo task ${taskId} timed out after ${timeoutMs}ms`);
}

async function processTripoJob(job: ProcessingJob): Promise<ProviderResult> {
  if (!TRIPO_API_KEY) throw new Error("TRIPO_API_KEY not configured");

  const taskId = await createTripoTask(job.input);
  console.log(`[Worker] Tripo task created: ${taskId}`);

  await markOptimizing(job.id);
  return pollTripoTask(taskId);
}

// ---------------------------------------------------------------------------
// Provider router
// ---------------------------------------------------------------------------
async function processJob(job: ProcessingJob): Promise<ProviderResult> {
  switch (job.provider) {
    case "meshy":
      return processMeshyJob(job);
    case "tripo":
      return processTripoJob(job);
    default:
      throw new Error(`Unknown provider: ${job.provider}`);
  }
}

// ---------------------------------------------------------------------------
// Transfer generated assets into our storage
// ---------------------------------------------------------------------------
async function persistAssets(
  job: ProcessingJob,
  result: ProviderResult,
): Promise<ProviderResult> {
  const { product_id, merchant_id } = job;

  // Download and upload GLB
  let glbUrl = result.glb_url;
  if (glbUrl) {
    const ext = "glb";
    const destPath = productAssetPath(merchant_id, product_id, null, ext);
    const { fullUrl } = await transferRemoteFile("models", destPath, glbUrl);
    glbUrl = fullUrl;
  }

  // Download and upload USDZ (may be empty for Tripo)
  let usdzUrl = result.usdz_url;
  if (usdzUrl && usdzUrl !== glbUrl) {
    const ext = "usdz";
    const destPath = productAssetPath(merchant_id, product_id, null, ext);
    const { fullUrl } = await transferRemoteFile("models", destPath, usdzUrl);
    usdzUrl = fullUrl;
  }

  // Download thumbnail if present
  let thumbUrl = result.thumbnail_url;
  if (thumbUrl) {
    const destPath = `${merchant_id}/products/${product_id}/thumb.jpg`;
    const { fullUrl } = await transferRemoteFile("thumbnails", destPath, thumbUrl);
    thumbUrl = fullUrl;
  }

  // Update the product record with the generated asset URLs
  const updatePayload: Record<string, unknown> = {};
  if (glbUrl) updatePayload.model_glb_url = glbUrl;
  if (usdzUrl) updatePayload.model_usdz_url = usdzUrl;
  if (thumbUrl) updatePayload.thumbnail_url = thumbUrl;

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabaseAdmin
      .from("products")
      .update(updatePayload as never)
      .eq("id", product_id);

    if (error) {
      console.error(`[Worker] Failed to update product ${product_id}:`, error.message);
    }
  }

  if (job.business_id && (glbUrl || usdzUrl)) {
    const { error: modelError } = await supabaseAdmin.from("models").upsert({
      business_id: job.business_id,
      product_id,
      model_url: glbUrl || null,
      usdz_url: usdzUrl || null,
      status: "ready",
    }, { onConflict: "business_id,product_id" });
    if (modelError) console.error(`[Worker] Failed to mark model ready for ${product_id}:`, modelError.message);
  }

  return { ...result, glb_url: glbUrl, usdz_url: usdzUrl, thumbnail_url: thumbUrl };
}

// ---------------------------------------------------------------------------
// Main worker entry
// ---------------------------------------------------------------------------
export async function runWorker(): Promise<void> {
  console.log(`[Worker] Scanning for queued jobs (PID: ${process.pid})`);

  const jobs = await getJobsToProcess();
  if (jobs.length === 0) {
    console.log("[Worker] No jobs to process");
    return;
  }

  console.log(`[Worker] Found ${jobs.length} job(s) to process`);

  for (const job of jobs) {
    const acquired = await acquireJob(job.id);
    if (!acquired) {
      console.log(`[Worker] Job ${job.id} was taken by another worker, skipping`);
      continue;
    }

    const startTime = Date.now();
    console.log(`[Worker] Processing job ${job.id} (provider: ${job.provider})`);

    try {
      // 1. Call AI provider
      const rawResult = await processJob(acquired);

      // 2. Transfer assets to our storage
      const finalResult = await persistAssets(acquired, rawResult);

      // 3. Mark complete
      await completeJob(acquired.id, finalResult);

      const elapsed = Date.now() - startTime;
      console.log(`[Worker] Job ${job.id} completed in ${elapsed}ms`);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Worker] Job ${job.id} failed after ${elapsed}ms: ${message}`);
      await failJob(acquired.id, message, acquired);
    }
  }
}
