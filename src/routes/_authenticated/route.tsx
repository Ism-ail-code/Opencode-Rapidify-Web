import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const user = data.user;

    // Gate 1: Block access until email is verified
    if (!user.email_confirmed_at) {
      throw redirect({ to: "/auth", search: { verify: "pending" } });
    }

    // Gate 2: Check if user has completed onboarding (has a merchant)
    const { data: member } = await supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      throw redirect({ to: "/auth/onboarding" });
    }

    return { user };
  },
  component: () => <Outlet />,
});
