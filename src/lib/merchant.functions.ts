import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendOnboardingCompleteEmail } from "@/lib/email.functions";

export const OnboardingSchema = z.object({
  fullName: z.string().trim().min(1, "Representative name is required").max(120),
  businessName: z.string().trim().min(1, "Business name is required").max(160),
  marketplace: z.enum(["shopify", "daraz", "amazon", "other"]),
  storeDomain: z.string().trim().url("Store URL must be a valid URL").max(2048),
  country: z.string().trim().min(1, "Country is required").max(100),
  businessEmail: z.string().trim().email("Business email must be valid").max(254),
  sellerId: z.string().trim().max(160).optional().default(""),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

function logDatabaseError(scope: string, userId: string, error: unknown) {
  const dbError = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  console.error(`[${scope}] database operation failed`, {
    userId,
    code: dbError?.code,
    message: dbError?.message ?? String(error),
    details: dbError?.details,
    hint: dbError?.hint,
  });
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 52) || "store"
  );
}

async function uniqueMerchantSlug(db: any, businessName: string, userId: string) {
  const base = slugify(businessName);
  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index}`;
    const { data, error } = await db
      .from("merchants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }

  return `${base}-${userId.slice(0, 8)}`;
}

/**
 * Idempotently creates the auth-owned profile. It is called after browser sign
 * up and complements the auth.users trigger from the migration. Keeping both
 * protections makes failures visible rather than silently redirecting users.
 */
export const ensureBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: userData } = await context.supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    const { data: profile, error } = await context.supabase
      .from("business_profiles")
      .upsert({ id: context.userId, business_email: email }, { onConflict: "id" })
      .select("id, onboarding_completed_at")
      .single();

    if (error) {
      logDatabaseError("ensureBusinessProfile", context.userId, error);
      throw new Error(
        "We could not create your merchant profile. Please try again or contact support.",
      );
    }

    return profile;
  });

export const getMyMerchant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("merchants")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) {
      logDatabaseError("getMyMerchant", context.userId, error);
      throw new Error("Unable to load merchant workspace");
    }
    return data;
  });

export async function getMyMerchantId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("business_profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) {
      logDatabaseError("getMyProfile", context.userId, error);
      throw new Error("Unable to load merchant profile");
    }
    return data;
  });

/**
 * Dev-only: one-click quick setup that bypasses RLS via supabaseAdmin.
 * Only callable when NODE_ENV=development or ENABLE_DEVELOPER_TOOLS=true.
 */
export const devQuickSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const env = process.env.NODE_ENV || "development";
    if (env !== "development" && process.env.ENABLE_DEVELOPER_TOOLS !== "true") {
      throw new Error("Developer tools are disabled.");
    }

    const userId = context.userId;
    const { data: userData } = await context.supabase.auth.getUser();
    const email = userData.user?.email ?? "demo@rapidify.app";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date().toISOString();

    // 1. Mark onboarding complete in auth user metadata (always works, no tables needed)
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { onboarding_completed_at: now },
    });

    // 2. Try to upsert business_profiles (if table exists, good; if not, skip silently)
    const profilePayload = {
      id: userId,
      representative_name: "Demo Merchant",
      business_name: "Demo Store",
      marketplace: "other",
      store_url: "https://demo-store.rapidify.app",
      country: "United States",
      business_email: email,
      seller_id: "DEMO001",
      onboarding_completed_at: now,
      is_verified: false,
    };
    const { data: businessProfile } = await supabaseAdmin
      .from("business_profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select("id, onboarding_completed_at")
      .maybeSingle();
    const profile = businessProfile ?? { id: userId, onboarding_completed_at: now };

    // 3. Try merchant + merchant_members + store_integrations (non-blocking)
    const merchantResult = await (async () => {
      try {
        let { data: merchant } = await supabaseAdmin
          .from("merchants").select("id").eq("owner_id", userId).maybeSingle();

        if (!merchant) {
          const slug = `demo-store-${userId.slice(0, 8)}`;
          const { data: createdMerchant } = await supabaseAdmin
            .from("merchants").insert({
              owner_id: userId, name: "Demo Store", slug,
              store_domain: "https://demo-store.rapidify.app", marketplace: "other",
            }).select("id").single();
          merchant = createdMerchant!;
        }

        await supabaseAdmin.from("merchant_members").upsert(
          { merchant_id: merchant.id, user_id: userId, role: "owner" },
          { onConflict: "merchant_id,user_id" },
        );

        await supabaseAdmin.from("store_integrations").upsert(
          { business_id: userId, platform: "other", store_url: "https://demo-store.rapidify.app", status: "active" },
          { onConflict: "business_id,platform,store_url" },
        );

        return merchant.id;
      } catch {
        return null;
      }
    })();

    console.info("[devQuickSetup] complete", { userId, merchantId: merchantResult });
    return { success: true, merchantId: merchantResult, profile };
  });

/** Completes onboarding only after the canonical business_profiles upsert succeeds. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OnboardingSchema.parse(input))
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const db = context.supabase;

    const profilePayload = {
      id: userId,
      representative_name: data.fullName,
      business_name: data.businessName,
      marketplace: data.marketplace,
      store_url: data.storeDomain,
      country: data.country,
      business_email: data.businessEmail,
      seller_id: data.sellerId || null,
      onboarding_completed_at: new Date().toISOString(),
      // Verification is an explicit operational status, never a score or tier.
      is_verified: false,
    };

    console.info("[completeOnboarding] saving business profile", { userId });
    const { data: profile, error: profileError } = await db
      .from("business_profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select("id, business_name, onboarding_completed_at, is_verified")
      .single();

    if (profileError || !profile) {
      logDatabaseError("completeOnboarding.profile", userId, profileError);
      throw new Error(
        "Your business profile could not be saved. Nothing has been redirected; please try again.",
      );
    }

    // Read-after-write catches RLS/schema mistakes before the client can leave onboarding.
    const { data: verifiedProfile, error: readError } = await db
      .from("business_profiles")
      .select("id, onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();
    if (readError || !verifiedProfile?.onboarding_completed_at) {
      logDatabaseError("completeOnboarding.profileVerification", userId, readError);
      throw new Error(
        "Your profile was not verified after saving. Please contact support with this error.",
      );
    }

    let { data: merchant, error: merchantReadError } = await db
      .from("merchants")
      .select("id, name, slug")
      .eq("owner_id", userId)
      .maybeSingle();
    if (merchantReadError) {
      logDatabaseError("completeOnboarding.merchantLookup", userId, merchantReadError);
      throw new Error("Unable to prepare your merchant workspace.");
    }

    if (!merchant) {
      const slug = await uniqueMerchantSlug(db, data.businessName, userId);
      const { data: createdMerchant, error: merchantInsertError } = await db
        .from("merchants")
        .insert({
          owner_id: userId,
          name: data.businessName,
          slug,
          store_domain: data.storeDomain,
          marketplace: data.marketplace,
        })
        .select("id, name, slug")
        .single();
      if (merchantInsertError || !createdMerchant) {
        logDatabaseError("completeOnboarding.merchantInsert", userId, merchantInsertError);
        throw new Error(
          "Your profile was saved, but the merchant workspace could not be created. Please retry.",
        );
      }
      merchant = createdMerchant;
    } else {
      const { error: merchantUpdateError } = await db
        .from("merchants")
        .update({
          name: data.businessName,
          store_domain: data.storeDomain,
          marketplace: data.marketplace,
        })
        .eq("id", merchant.id);
      if (merchantUpdateError) {
        logDatabaseError("completeOnboarding.merchantUpdate", userId, merchantUpdateError);
        throw new Error(
          "Your profile was saved, but the merchant workspace could not be updated. Please retry.",
        );
      }
    }

    const { error: memberError } = await db
      .from("merchant_members")
      .upsert(
        { merchant_id: merchant.id, user_id: userId, role: "owner" },
        { onConflict: "merchant_id,user_id" },
      );
    if (memberError) {
      logDatabaseError("completeOnboarding.memberInsert", userId, memberError);
      throw new Error("Your workspace membership could not be created. Please retry.");
    }

    const { error: integrationError } = await db.from("store_integrations").upsert(
      {
        business_id: userId,
        platform: data.marketplace,
        store_url: data.storeDomain,
        status: "active",
      },
      { onConflict: "business_id,platform,store_url" },
    );
    if (integrationError) {
      // A failed optional integration must be visible but must not invalidate a
      // successfully persisted profile/workspace pair.
      logDatabaseError("completeOnboarding.integration", userId, integrationError);
    }

    console.info("[completeOnboarding] complete", { userId, merchantId: merchant.id });

    sendOnboardingCompleteEmail({
      data: {
        email: data.businessEmail,
        name: data.fullName,
        businessName: data.businessName,
      },
    }).catch((err) => {
      console.error("[completeOnboarding] failed to send welcome email", err);
    });

    return { success: true, merchantId: merchant.id, profile };
  });
