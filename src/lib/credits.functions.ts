import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cost schedule — each operation costs N credits.
 * TODO: Move to a config table or env var when billing is wired.
 */
export const CREDIT_COSTS = {
  processing_job: 1,
  marketplace_sync: 1,
  ai_generation: 2,
} as const;

// ---------------------------------------------------------------------------
// Query: get credit balance
// ---------------------------------------------------------------------------

export const getCreditBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) return { balance: 0, transactions: [] };

    const { data: credits } = await context.supabase
      .from("merchant_credits")
      .select("balance")
      .eq("merchant_id", merchant.id)
      .maybeSingle();

    const { data: transactions } = await context.supabase
      .from("credit_transactions")
      .select("id, amount, reason, ref_id, metadata, created_at")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      balance: credits?.balance ?? 0,
      transactions: transactions ?? [],
    };
  });

// ---------------------------------------------------------------------------
// Query: check if merchant has enough credits for an operation
// ---------------------------------------------------------------------------

export const checkCreditBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    operation: z.enum(["processing_job", "marketplace_sync", "ai_generation"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const cost = CREDIT_COSTS[data.operation];

    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) return { hasEnough: false, balance: 0, cost };

    const { data: credits } = await context.supabase
      .from("merchant_credits")
      .select("balance")
      .eq("merchant_id", merchant.id)
      .maybeSingle();

    const balance = credits?.balance ?? 0;
    return { hasEnough: balance >= cost, balance, cost };
  });

// ---------------------------------------------------------------------------
// Mutation: deduct credits (atomic via RPC)
// ---------------------------------------------------------------------------

export const deductCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    amount: z.number().int().positive(),
    reason: z.string().min(1).max(100),
    ref_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) throw new Error("No merchant profile found");

    const { data: ok } = await context.supabase.rpc("deduct_credits", {
      _merchant_id: merchant.id,
      _amount: data.amount,
      _reason: data.reason,
      _ref_id: data.ref_id ?? null,
    });

    if (!ok) throw new Error("Insufficient credits");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Mutation: add credits (top-up, admin or webhook)
// ---------------------------------------------------------------------------

export const addCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    merchant_id: z.string().uuid(),
    amount: z.number().int().positive(),
    reason: z.string().min(1).max(100),
    ref_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Authorization: user must own the merchant or be an admin
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id, owner_id")
      .eq("id", data.merchant_id)
      .maybeSingle();

    if (!merchant) throw new Error("Merchant not found");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _role: "admin",
      _user_id: context.userId,
    });

    if (merchant.owner_id !== context.userId && !isAdmin) {
      throw new Error("Unauthorized: you can only add credits to your own merchant account");
    }

    await context.supabase.rpc("add_credits", {
      _merchant_id: data.merchant_id,
      _amount: data.amount,
      _reason: data.reason,
      _ref_id: data.ref_id ?? null,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Mutation: convenience — deduct for processing job
// ---------------------------------------------------------------------------

export const deductForProcessingJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    job_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) throw new Error("No merchant profile found");

    const cost = CREDIT_COSTS.processing_job;

    const { data: ok } = await context.supabase.rpc("deduct_credits", {
      _merchant_id: merchant.id,
      _amount: cost,
      _reason: "processing_job",
      _ref_id: data.job_id,
    });

    if (!ok) throw new Error("Insufficient credits for processing job");
    return { ok: true, cost };
  });

// ---------------------------------------------------------------------------
// Mutation: convenience — deduct for marketplace sync
// ---------------------------------------------------------------------------

export const deductForMarketplaceSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    connection_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: merchant } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (!merchant) throw new Error("No merchant profile found");

    const cost = CREDIT_COSTS.marketplace_sync;

    const { data: ok } = await context.supabase.rpc("deduct_credits", {
      _merchant_id: merchant.id,
      _amount: cost,
      _reason: "marketplace_sync",
      _ref_id: data.connection_id,
    });

    if (!ok) throw new Error("Insufficient credits for marketplace sync");
    return { ok: true, cost };
  });
