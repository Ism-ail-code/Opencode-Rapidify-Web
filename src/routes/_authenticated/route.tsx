import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw redirect({ to: "/auth", search: { verify: undefined as string | undefined } });
    }

    // Check user app_metadata first (works even without custom tables)
    if (session.user.app_metadata?.onboarding_completed_at) {
      return { session, user: session.user, businessProfile: { id: session.user.id, onboarding_completed_at: session.user.app_metadata.onboarding_completed_at as string } };
    }

    let { data: profile, error } = await supabase
      .from("business_profiles")
      .select("id, onboarding_completed_at")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("[route-guard] Unable to load business profile", { userId: session.user.id, message: error.message, code: error.code });
    }

    if (!profile) {
      const { data: fallbackProfile } = await supabase
        .from("profiles")
        .select("id, onboarding_completed_at")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!fallbackProfile?.onboarding_completed_at) {
        throw redirect({ to: "/auth/onboarding", search: { verify: undefined } });
      }
      profile = fallbackProfile;
    }

    return { session, user: session.user, businessProfile: profile };
  },
  component: () => <Outlet />,
});
