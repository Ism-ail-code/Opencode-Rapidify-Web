import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyMerchant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("merchants").select("*").eq("owner_id", context.userId).maybeSingle();
    return data;
  });

export const claimDemoStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Assign demo merchant to user if it's unclaimed
    const { data: demo } = await supabaseAdmin
      .from("merchants").select("id, owner_id").eq("slug", "rapidify-demo").maybeSingle();
    if (demo && !demo.owner_id) {
      await supabaseAdmin.from("merchants").update({ owner_id: context.userId }).eq("id", demo.id);
      return { claimed: true };
    }
    return { claimed: false };
  });

export interface OnboardingInput {
  fullName: string;
  corporateTitle: string;
  brandName: string;
  storeDomain: string;
}

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: OnboardingInput) => data)
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

    // Generate slug from brand name
    const slug = data.brandName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure slug is unique
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

    // 1. Create profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        full_name: data.fullName,
        corporate_title: data.corporateTitle,
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
        name: data.brandName,
        slug: finalSlug,
        store_domain: data.storeDomain,
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

    return { success: true, merchantId };
  });
