import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidUrl, isUrlReachable, verifyWebhookConnectivity } from "@/lib/verification.functions";

export const getMyMerchant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("merchants").select("*").eq("owner_id", context.userId).maybeSingle();
    return data;
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles").select("*").eq("id", context.userId).maybeSingle();
    return data;
  });

export const claimDemoStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: demo } = await supabaseAdmin
      .from("merchants").select("id, owner_id").eq("slug", "rapidify-demo").maybeSingle();
    if (demo && !demo.owner_id) {
      await supabaseAdmin.from("merchants").update({ owner_id: context.userId }).eq("id", demo.id);
      return { claimed: true };
    }
    return { claimed: false };
  });

// ---------------------------------------------------------------------------
// Onboarding input schema with business verification fields
// ---------------------------------------------------------------------------

export const OnboardingSchema = z.object({
  // Required
  fullName: z.string().min(1, "Representative name is required"),
  businessName: z.string().min(1, "Business name is required"),
  marketplace: z.enum(["shopify", "daraz", "amazon", "other"]),
  storeDomain: z.string().url("Store URL must be a valid URL"),
  country: z.string().min(1, "Country is required"),
  businessEmail: z.string().email("Business email must be valid"),

  // Optional
  sellerId: z.string().optional().default(""),
  taxVatNumber: z.string().optional().default(""),
  estimatedMonthlyOrders: z.number().int().min(0).optional().default(0),
  webhookUrl: z.string().url().optional().or(z.literal("")),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OnboardingSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Check if already onboarded
    const { data: existing } = await supabaseAdmin
      .from("merchant_members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return { success: true, message: "Already onboarded" };
    }

    // Generate slug from business name
    const slug = data.businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    let finalSlug = slug;
    let counter = 1;
    while (true) {
      const { data: slugCheck } = await supabaseAdmin
        .from("merchants")
        .select("id")
        .eq("slug", finalSlug)
        .maybeSingle();
      if (!slugCheck) break;
      finalSlug = `${slug}-${counter}`;
      counter++;
    }

    // --- Verification checks ---

    // 1. Validate store URL is reachable
    let storeUrlValid = false;
    try {
      storeUrlValid = isValidUrl(data.storeDomain) && await isUrlReachable(data.storeDomain);
    } catch {
      storeUrlValid = false;
    }

    // 2. Verify webhook connectivity if a webhook URL was provided
    let webhookOk = true;
    let webhookMessage = "";
    if (data.webhookUrl) {
      const result = await verifyWebhookConnectivity(data.webhookUrl);
      webhookOk = result.ok;
      webhookMessage = result.message;
    }

    // is_verified = true when onboarding complete AND store URL valid
    // AND webhook verified (if configured). If webhook fails, still allow
    // the business to use the platform — just mark not verified.
    const storeUrlVerified = isValidUrl(data.storeDomain) && storeUrlValid;
    const isVerified = storeUrlVerified && webhookOk;

    // --- Create records ---

    // 1. Create/update profile with business verification data
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        full_name: data.fullName,
        corporate_title: data.businessName,
        business_name: data.businessName,
        country: data.country,
        business_email: data.businessEmail,
        seller_id: data.sellerId || "",
        tax_vat_number: data.taxVatNumber || "",
        estimated_monthly_orders: data.estimatedMonthlyOrders || 0,
        is_verified: isVerified,
        onboarding_completed_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (profileError) {
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // 2. Create merchant
    const merchantId = crypto.randomUUID();
    const { error: merchantError } = await supabaseAdmin
      .from("merchants")
      .insert({
        id: merchantId,
        owner_id: userId,
        name: data.businessName,
        slug: finalSlug,
        store_domain: data.storeDomain,
        marketplace: data.marketplace,
      });

    if (merchantError) {
      throw new Error(`Failed to create merchant: ${merchantError.message}`);
    }

    // 3. Create merchant_member with owner role
    const { error: memberError } = await supabaseAdmin
      .from("merchant_members")
      .insert({
        merchant_id: merchantId,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      throw new Error(`Failed to create merchant member: ${memberError.message}`);
    }

    return {
      success: true,
      merchantId,
      isVerified,
      storeUrlValid,
      webhookOk,
      webhookMessage: webhookMessage || undefined,
    };
  });
