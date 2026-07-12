import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CREDIT_COSTS } from "@/lib/credits.functions";

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
    // Look up the merchant's actual UUID (not the auth user ID)
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) throw new Error("Merchant not found");

    // Deduct credits before queueing
    const { data: ok } = await context.supabase.rpc("deduct_credits", {
      _merchant_id: merchant.id,
      _amount: CREDIT_COSTS.processing_job,
      _reason: "processing_job",
      _ref_id: data.product_id,
    });
    if (!ok) throw new Error("Insufficient credits for 3D generation");

    const { data: job, error } = await context.supabase
      .from("processing_jobs")
      .insert({
        product_id: data.product_id,
        merchant_id: merchant.id,
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
    // Look up the merchant's actual UUID
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) return [];

    const { data, error } = await context.supabase
      .from("processing_jobs")
      .select("*")
      .eq("merchant_id", merchant.id)
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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) throw new Error("Merchant not found");
    const merchantId = merchant.id;

    const job = await getJobById(data.job_id, merchantId);
    if (!job) throw new Error("Job not found");
    
    switch (data.action) {
      case "start":
        await startJob(job.id, merchantId);
        break;
      case "retry":
        await retryJob(job.id, merchantId);
        break;
      case "fail":
        await failJob(job.id, merchantId, data.error_message);
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
      error: errorMessage || "Processing failed",
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
      error: null,
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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) return [];

    const { data, error } = await supabaseAdmin
      .from("processing_jobs")
      .select("*")
      .eq("merchant_id", merchant.id)
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
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!merchant) throw new Error("Merchant not found");
    const merchantId = merchant.id;

    const { data: job, error } = await supabaseAdmin
      .from("processing_jobs")
      .select("*")
      .eq("id", data.job_id)
      .eq("merchant_id", merchantId)
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
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.job_id)
        .eq("merchant_id", merchantId)
        .select()
        .single();
      
      if (updateError) throw updateError;
      return updated;
    } else {
      throw new Error("Max retries exceeded");
    }
  });