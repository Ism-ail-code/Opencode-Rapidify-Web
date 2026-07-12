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

/** Reusable helper: fetches the authenticated user's merchant UUID for use in other server functions */
export async function getMyMerchantId(
  supabase: any,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

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
    const db = context.supabase;

    // --- Step 1: Check if already onboarded ---
    console.log("[completeOnboarding] Step 1: Checking existing membership for user", userId);
    const { data: existing, error: existingError } = await db
      .from("merchant_members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("[completeOnboarding] Step 1 FAILED - Error checking existing membership:", existingError);
      throw new Error(`Failed to check existing status: ${existingError.message}`);
    }

    if (existing) {
      console.log("[completeOnboarding] Step 1: User already onboarded (merchant_members found)");
      return { success: true, message: "Already onboarded" };
    }
    console.log("[completeOnboarding] Step 1 OK - No existing membership found");

    // --- Step 2: Generate unique slug ---
    console.log("[completeOnboarding] Step 2: Generating slug");
    const slug = data.businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    let finalSlug = slug;
    let counter = 1;
    while (true) {
      const { data: slugCheck, error: slugError } = await db
        .from("merchants")
        .select("id")
        .eq("slug", finalSlug)
        .maybeSingle();
      if (slugError) {
        console.error("[completeOnboarding] Step 2 FAILED - Error checking slug:", slugError);
        throw new Error(`Failed to check slug: ${slugError.message}`);
      }
      if (!slugCheck) break;
      finalSlug = `${slug}-${counter}`;
      counter++;
    }
    console.log("[completeOnboarding] Step 2 OK - Slug:", finalSlug);

    // --- Step 3: Verification checks ---
    console.log("[completeOnboarding] Step 3: Running verification checks");
    let storeUrlValid = false;
    try {
      storeUrlValid = isValidUrl(data.storeDomain) && await isUrlReachable(data.storeDomain);
    } catch {
      storeUrlValid = false;
    }

    let webhookOk = true;
    let webhookMessage = "";
    if (data.webhookUrl) {
      const result = await verifyWebhookConnectivity(data.webhookUrl);
      webhookOk = result.ok;
      webhookMessage = result.message;
    }

    const storeUrlVerified = isValidUrl(data.storeDomain) && storeUrlValid;
    const isVerified = storeUrlVerified && webhookOk;
    console.log("[completeOnboarding] Step 3 OK - storeUrlValid:", storeUrlValid, "webhookOk:", webhookOk, "isVerified:", isVerified);

    // --- Step 4: Upsert profile (business_profiles) ---
    console.log("[completeOnboarding] Step 4: Upserting profile for user", userId);
    const { error: profileError } = await db
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
      console.error("[completeOnboarding] Step 4 FAILED - Profile upsert error:", profileError);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // Verify the profile was actually created by reading it back
    const { data: verifiedProfile, error: verifyProfileError } = await db
      .from("profiles")
      .select("id, business_name, country, business_email, store_domain, marketplace")
      .eq("id", userId)
      .maybeSingle();

    if (verifyProfileError) {
      console.error("[completeOnboarding] Step 4 VERIFY FAILED - Could not read back profile:", verifyProfileError);
      throw new Error(`Profile created but verification read failed: ${verifyProfileError.message}`);
    }
    if (!verifiedProfile) {
      console.error("[completeOnboarding] Step 4 VERIFY FAILED - Profile upsert returned no error but row not found for user", userId);
      throw new Error("Profile upsert reported success but row was not created. Check RLS policies.");
    }
    console.log("[completeOnboarding] Step 4 OK - Profile verified:", JSON.stringify(verifiedProfile));

    // --- Step 5: Insert merchant ---
    console.log("[completeOnboarding] Step 5: Creating merchant");
    const merchantId = crypto.randomUUID();
    const { error: merchantError } = await db
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
      console.error("[completeOnboarding] Step 5 FAILED - Merchant insert error:", merchantError);
      throw new Error(`Failed to create merchant: ${merchantError.message}`);
    }
    console.log("[completeOnboarding] Step 5 OK - Merchant created:", merchantId);

    // --- Step 6: Insert merchant_member (non-critical - owner access works via merchants.owner_id in RLS) ---
    console.log("[completeOnboarding] Step 6: Inserting merchant_member (non-critical)");
    const { error: memberError } = await supabaseAdmin
      .from("merchant_members")
      .insert({
        merchant_id: merchantId,
        user_id: userId,
        role: "owner",
      });

    if (memberError) {
      console.error("[completeOnboarding] Step 6 WARN - Admin insert failed, trying fallback:", memberError);
      const { error: fallbackError } = await db
        .from("merchant_members")
        .insert({
          merchant_id: merchantId,
          user_id: userId,
          role: "owner",
        });

      if (fallbackError) {
        // Non-critical: is_merchant_member() RLS function also checks merchants.owner_id directly
        console.warn("[completeOnboarding] Step 6 NON-CRITICAL - Merchant member insert failed (both admin and fallback). Owner will still pass RLS via merchants.owner_id.", fallbackError.message);
      } else {
        console.log("[completeOnboarding] Step 6 OK - merchant_member created via fallback");
      }
    } else {
      console.log("[completeOnboarding] Step 6 OK - merchant_member created via admin client");
    }

    console.log("[completeOnboarding] COMPLETE for user", userId);

    return {
      success: true,
      merchantId,
      isVerified,
      storeUrlValid,
      webhookOk,
      webhookMessage: webhookMessage || undefined,
    };
  });
