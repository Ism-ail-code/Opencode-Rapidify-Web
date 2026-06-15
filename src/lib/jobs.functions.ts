import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const jobStatus = z.enum(["queued", "processing", "optimizing", "ready", "failed"]);
const jobProvider = z.enum(["meshy", "tripo", "stability"]);

export const createProcessingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    product_id: z.string().uuid(),
    provider: jobProvider,
    input: z.record(z.unknown()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("processing_jobs")
      .insert({
        product_id: data.product_id,
        merchant_id: context.userId,
        provider: data.provider,
        status: "queued",
        input: data.input,
        retries: 0,
        max_retries: 5,
        next_retry_at: new Date(Date.now() + 1000).toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    return job;
  });

export const getProcessingJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("processing_jobs")
      .select("*")
      .eq("merchant_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (error) throw error;
    return data ?? [];
  });

export const processJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    job_id: z.string().uuid(),
    action: z.enum(["start", "retry", "fail"]),
    error_message: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const job = await getJobById(data.job_id, context.userId);
    if (!job) throw new Error("Job not found");
    
    switch (data.action) {
      case "start":
        await startJob(job.id, context.userId);
        break;
      case "retry":
        await retryJob(job.id, context.userId);
        break;
      case "fail":
        await failJob(job.id, context.userId, data.error_message);
        break;
    }
    
    return { success: true };
  });

async function getJobById(jobId: string, merchantId: string) {
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

async function startJob(jobId: string, merchantId: string) {
  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "processing",
      started_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function completeJob(jobId: string, merchantId: string, result: any) {
  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "ready",
      completed_at: now.toISOString(),
      result: result,
      updated_at: now.toISOString(),
    })
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function failJob(jobId: string, merchantId: string, errorMessage?: string) {
  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "failed",
      error_message: errorMessage || "Processing failed",
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function retryJob(jobId: string, merchantId: string) {
  const job = await getJobById(jobId, merchantId);
  if (!job) throw new Error("Job not found");
  
  if (job.retries >= job.max_retries) {
    throw new Error("Max retries exceeded");
  }
  
  const nextRetryDelay = Math.pow(2, job.retries) * 1000;
  const nextRetryAt = new Date(Date.now() + nextRetryDelay);
  
  const { data, error } = await supabaseAdmin
    .from("processing_jobs")
    .update({
      status: "queued",
      retries: job.retries + 1,
      next_retry_at: nextRetryAt.toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export const getDeadLetterJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("processing_jobs")
      .select("*")
      .eq("merchant_id", context.userId)
      .eq("status", "failed")
      .gte("retries", 5)
      .order("updated_at", { ascending: false })
      .limit(20);
    
    if (error) throw error;
    return data ?? [];
  });

export const requeueDeadLetterJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    job_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await supabaseAdmin
      .from("processing_jobs")
      .select("*")
      .eq("id", data.job_id)
      .eq("merchant_id", context.userId)
      .maybeSingle();
    
    if (error) throw error;
    if (!job) throw new Error("Job not found");
    
    if (job.retries < job.max_retries) {
      const nextRetryDelay = Math.pow(2, job.retries) * 1000;
      const nextRetryAt = new Date(Date.now() + nextRetryDelay);
      
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("processing_jobs")
        .update({
          status: "queued",
          retries: job.retries + 1,
          next_retry_at: nextRetryAt.toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.job_id)
        .eq("merchant_id", context.userId)
        .select()
        .single();
      
      if (updateError) throw updateError;
      return updated;
    } else {
      throw new Error("Max retries exceeded");
    }
  });