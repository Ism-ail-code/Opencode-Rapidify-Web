import { supabaseAdmin } from "../integrations/supabase/client.server";
import { transferRemoteFile, productAssetPath } from "../lib/storage";
import { getProvider, type ProviderResult } from "./providers";
import { notifyModelReady } from "../lib/model-notifications";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_JOBS = 5;
const PENDING_REQUEUE_DELAY_MS = 60_000; // provider still working — check again in 60s

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

/**
 * Raised when the provider reports the task is still processing ("pending").
 * The job is requeued instead of failed — retrying will RESUME the same
 * provider task (persisted as input.task_id), so no task is ever re-created
 * and re-billed.
 */
class PendingTaskError extends Error {
  constructor() {
    super("Provider task still processing");
    this.name = "PendingTaskError";
  }
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

/** CAS: only complete from an in-flight status. Returns true when claimed. */
async function completeJob(jobId: string, result: ProviderResult): Promise<boolean> {
  const now = new Date().toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "ready",
      completed_at: now,
      output: result as never,
      updated_at: now,
    })
    .eq("id", jobId)
    .in("status", ["processing", "optimizing"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[Worker] Error completing job ${jobId}:`, error.message);
    return false;
  }
  if (!updated?.id) {
    console.log(`[Worker] Job ${jobId} already completed by another path — skipping`);
    return false;
  }
  return true;
}

async function markOptimizing(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("processing_jobs")
    .update({ status: "optimizing", updated_at: now })
    .eq("id", jobId);
}

/**
 * Requeues a job whose provider task is still running ("pending"). Retries are
 * NOT incremented — this is not a failure, and the persisted task_id means the
 * next cycle resumes the same provider task.
 */
async function requeuePending(jobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "queued",
      next_retry_at: new Date(Date.now() + PENDING_REQUEUE_DELAY_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["processing", "optimizing"])
    .select("id")
    .maybeSingle();

  if (error) console.error(`[Worker] Error requeueing pending job ${jobId}:`, error.message);
}

async function failJob(
  jobId: string,
  errorMessage: string,
  job: ProcessingJob,
): Promise<void> {
  const now = new Date();
  const shouldFail = job.retries >= job.max_retries;
  // Exponential backoff with jitter to avoid thundering-herd retries.
  const baseDelay = Math.pow(2, job.retries) * 1000;
  const nextDelay = baseDelay + Math.round(Math.random() * 1000);
  const nextRetryAt = new Date(now.getTime() + nextDelay);

  // CAS: only transition from an in-flight status (processing OR optimizing).
  // If the provider webhook already resolved the job, don't clobber it (and
  // don't refund twice). Without the "optimizing" arm, a failure after
  // markOptimizing() would leave the job stuck forever.
  const { data: updated, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: shouldFail ? "failed" : "queued",
      retries: job.retries + 1,
      next_retry_at: nextRetryAt.toISOString(),
      error: errorMessage,
      updated_at: now.toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["processing", "optimizing"])
    .select("id")
    .maybeSingle();

  if (error) console.error(`[Worker] Error failing job ${jobId}:`, error.message);
  if (!updated?.id) {
    console.log(`[Worker] Job ${jobId} already resolved by another path — skipping failure`);
    return;
  }

  // Refund the credit when a billed job exhausts its retries — merchants
  // should not pay for models the pipeline could not produce.
  if (shouldFail && job.input?.billed === true) {
    try {
      await supabaseAdmin.rpc("add_credits", {
        _merchant_id: job.merchant_id,
        _amount: 1,
        _reason: "processing_job_refund",
        _ref_id: job.id,
      });
      console.log(`[Worker] Refunded 1 credit to merchant ${job.merchant_id} for failed job ${jobId}`);
    } catch (refundErr) {
      console.error(`[Worker] Refund failed for job ${jobId}:`, refundErr instanceof Error ? refundErr.message : refundErr);
    }
  }
}

/** Persists the provider task id on the job so retries/webhooks can match it. */
async function persistTaskId(jobId: string, input: Record<string, unknown>, taskId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("processing_jobs")
    .update({ input: { ...input, task_id: taskId } as never, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) console.error(`[Worker] Failed to persist task_id for job ${jobId}:`, error.message);
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------
async function processJob(job: ProcessingJob): Promise<ProviderResult> {
  const adapter = getProvider(job.provider);
  const input = job.input ?? {};

  // Resume an existing provider task when present — retries and pending
  // requeues must never create a new (paid) task for the same job.
  const existingTaskId = typeof input.task_id === "string" && input.task_id ? input.task_id : null;

  let taskId: string;
  if (existingTaskId) {
    taskId = existingTaskId;
  } else {
    taskId = await adapter.createTask(input);
    console.log(`[Worker] ${job.provider} task created: ${taskId}`);
    await persistTaskId(job.id, input, taskId);
  }

  await markOptimizing(job.id);

  const outcome = await adapter.pollTask(taskId);
  if (outcome.status === "completed") return outcome.result;
  if (outcome.status === "failed") throw new Error(outcome.error);
  throw new PendingTaskError();
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
// Stale-job reaper
// A job stuck in an in-flight state (worker crash, provider hang) is requeued
// so the next cycle can pick it up. Retries are incremented to avoid livelock.
// ---------------------------------------------------------------------------
const STALE_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function reapStaleJobs(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_TIMEOUT_MS).toISOString();

  const { data: stale, error } = await supabaseAdmin
    .from("processing_jobs")
    .select("id, retries, max_retries")
    .in("status", ["processing", "optimizing"])
    .lte("started_at", staleBefore);

  if (error) {
    console.error("[Worker] Failed to scan for stale jobs:", error.message);
    return 0;
  }

  let reaped = 0;
  for (const job of stale ?? []) {
    const nextRetryAt = new Date(Date.now() + 30_000).toISOString();
    const permanentFail = (job.retries ?? 0) >= (job.max_retries ?? 5);

    await supabaseAdmin
      .from("processing_jobs")
      .update({
        status: permanentFail ? "failed" : "queued",
        retries: (job.retries ?? 0) + 1,
        next_retry_at: nextRetryAt,
        error: permanentFail ? "Job exceeded maximum retries after being stuck" : "Requeued: worker crashed while processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    reaped += 1;
  }

  if (reaped > 0) console.log(`[Worker] Reaped ${reaped} stale job(s) stuck in processing`);
  return reaped;
}

// ---------------------------------------------------------------------------
// Main worker entry
// ---------------------------------------------------------------------------
export async function runWorker(): Promise<void> {
  console.log(`[Worker] Scanning for queued jobs (PID: ${process.pid})`);

  await reapStaleJobs();

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
      // 1. Call AI provider (or resume an in-flight task)
      const rawResult = await processJob(acquired);

      // 2. Transfer assets to our storage
      const finalResult = await persistAssets(acquired, rawResult);

      // 3. Mark complete (CAS) — then notify the owner exactly once
      const claimed = await completeJob(acquired.id, finalResult);
      if (claimed) {
        await notifyModelReady({
          productId: acquired.product_id,
          merchantId: acquired.merchant_id,
          businessId: acquired.business_id,
        });
      }

      const elapsed = Date.now() - startTime;
      console.log(`[Worker] Job ${job.id} completed in ${elapsed}ms`);
    } catch (err) {
      const elapsed = Date.now() - startTime;

      // Provider still working — requeue without counting a failure.
      if (err instanceof PendingTaskError) {
        console.log(`[Worker] Job ${job.id} still processing at provider — requeueing (${elapsed}ms)`);
        await requeuePending(acquired.id);
        continue;
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Worker] Job ${job.id} failed after ${elapsed}ms: ${message}`);
      await failJob(acquired.id, message, acquired);
    }
  }
}
