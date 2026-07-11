import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw redirect({ to: "/auth", search: { verify: undefined as string | undefined } });
    }

    return { session, user: session.user };
  },
  component: () => <Outlet />,
});
