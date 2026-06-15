// Background job worker for AR Commerce Platform
// This should be run as a scheduled function or cron job

import { supabaseAdmin } from "../integrations/supabase/client.server";

const JOB_TIMEOUT_MS = 30000; // 30 seconds timeout per job
const MAX_CONCURRENT_JOBS = 5;

interface ProcessingJob {
  id: string;
  product_id: string;
  merchant_id: string;
  provider: string;
  status: string;
  input: any;
  retries: number;
  max_retries: number;
  next_retry_at: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

async function getJobsToProcess(limit: number = MAX_CONCURRENT_JOBS): Promise<ProcessingJob[]> {
  const now = new Date();
  
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .select("*")
    .in("status", ["queued", "processing"])
    .lte("next_retry_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  
  if (error) {
    console.error("Error fetching jobs:", error);
    return [];
  }
  
  return data || [];
}

async function acquireJob(jobId: string): Promise<ProcessingJob | null> {
  const now = new Date();
  
  // Try to update job to processing status
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "processing",
      started_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select()
    .single();
  
  if (error || !data) {
    return null; // Job was taken by another worker
  }
  
  return data;
}

async function completeJob(jobId: string, result: any): Promise<void> {
  const now = new Date();
  
  const { error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "ready",
      completed_at: now.toISOString(),
      result: result,
      updated_at: now.toISOString(),
    })
    .eq("id", jobId);
  
  if (error) {
    console.error(`Error completing job ${jobId}:`, error);
  }
}

async function failJob(jobId: string, errorMessage: string, job: ProcessingJob): Promise<void> {
  const now = new Date();
  const nextRetryDelay = Math.pow(2, job.retries) * 1000; // Exponential backoff
  const nextRetryAt = new Date(Date.now() + nextRetryDelay);
  
  const { error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: job.retries >= job.max_retries ? "failed" : "queued",
      retries: job.retries + 1,
      next_retry_at: nextRetryAt.toISOString(),
      error_message: errorMessage,
      updated_at: now.toISOString(),
    })
    .eq("id", jobId);
  
  if (error) {
    console.error(`Error failing job ${jobId}:`, error);
  }
}

async function processJob(job: ProcessingJob): Promise<any> {
  try {
    console.log(`Processing job ${job.id} with provider ${job.provider}`);
    
    // Simulate job processing based on provider
    switch (job.provider) {
      case "meshy":
        return await processMeshyJob(job);
      case "tripo":
        return await processTripoJob(job);
      case "stability":
        return await processStabilityJob(job);
      default:
        throw new Error(`Unknown provider: ${job.provider}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Job ${job.id} failed:`, errorMessage);
    throw error;
  }
}

async function processMeshyJob(job: ProcessingJob): Promise<any> {
  // Simulate Meshy AI processing
  await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
  
  // Simulate occasional failures for testing
  if (Math.random() < 0.2) { // 20% failure rate
    throw new Error("Meshy AI processing failed: Model generation timeout");
  }
  
  return {
    model_id: `meshy_${job.id.slice(0, 8)}`,
    status: "completed",
    download_url: `https://storage.example.com/models/${job.id}.glb`,
    thumbnail_url: `https://storage.example.com/thumbs/${job.id}.jpg`,
  };
}

async function processTripoJob(job: ProcessingJob): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  if (Math.random() < 0.15) { // 15% failure rate
    throw new Error("Tripo AI processing failed: Invalid input format");
  }
  
  return {
    model_id: `tripo_${job.id.slice(0, 8)}`,
    status: "completed",
    download_url: `https://storage.example.com/models/${job.id}.usdz`,
    thumbnail_url: `https://storage.example.com/thumbs/${job.id}.jpg`,
  };
}

async function processStabilityJob(job: ProcessingJob): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  if (Math.random() < 0.1) { // 10% failure rate
    throw new Error("Stability AI processing failed: Resource quota exceeded");
  }
  
  return {
    model_id: `stability_${job.id.slice(0, 8)}`,
    status: "completed",
    download_url: `https://storage.example.com/models/${job.id}.glb`,
    thumbnail_url: `https://storage.example.com/thumbs/${job.id}.jpg`,
  };
}

async function runWorker(): Promise<void> {
  console.log("Starting background job worker...");
  
  try {
    const jobsToProcess = await getJobsToProcess();
    console.log(`Found ${jobsToProcess.length} jobs to process`);
    
    for (const job of jobsToProcess) {
      const acquiredJob = await acquireJob(job.id);
      if (!acquiredJob) continue;
      
      try {
        const result = await processJob(acquiredJob);
        await completeJob(acquiredJob.id, result);
        console.log(`Job ${acquiredJob.id} completed successfully`);
      } catch (error) {
        await failJob(acquiredJob.id, error instanceof Error ? error.message : "Unknown error", acquiredJob);
      }
    }
  } catch (error) {
    console.error("Worker error:", error);
  }
}

// Export for use in scheduled functions or cron jobs
export { runWorker };

// Allow running as a script
const isMainModule = process.argv[1]?.includes("job-worker");
if (isMainModule) {
  runWorker().then(() => {
    console.log("Worker completed");
    process.exit(0);
  }).catch(error => {
    console.error("Worker failed:", error);
    process.exit(1);
  });
}