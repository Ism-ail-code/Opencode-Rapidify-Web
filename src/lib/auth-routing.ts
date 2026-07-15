import { supabase } from "@/integrations/supabase/client";

export type AuthDestination = "/dashboard" | "/auth/onboarding";

/**
 * A profile row is the single source of truth for post-auth routing. A failed
 * lookup deliberately sends a user to onboarding instead of a data-heavy
 * dashboard, where an RLS/schema error would otherwise look like endless sync.
 */
export async function getPostAuthDestination(userId: string): Promise<AuthDestination> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select("id, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth-routing] Failed to load business profile", { userId, message: error.message, code: error.code });
    return "/auth/onboarding";
  }

  // An authenticated account without its canonical profile must repair it in
  // onboarding. Incomplete profiles can still open the dashboard and receive a
  // non-blocking completion banner.
  if (!data) return "/auth/onboarding";
  return "/dashboard";
}
