import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { ensureBusinessProfile } from "@/lib/merchant.functions";
import { getPostAuthDestination } from "@/lib/auth-routing";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Authenticating — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function finishAuthentication() {
      try {
        // Supabase exchanges the confirmation/OAuth token asynchronously in
        // some environments. A single short retry handles that state without
        // an unbounded redirect or polling loop.
        let { data, error } = await supabase.auth.getSession();
        if (!data.session && !error && window.location.hash.includes("access_token")) {
          await new Promise((resolve) => window.setTimeout(resolve, 300));
          ({ data, error } = await supabase.auth.getSession());
        }

        if (error || !data.session?.user) {
          console.error("[auth-callback] Session exchange failed", error);
          if (active) navigate({ to: "/auth", search: { verify: undefined }, replace: true });
          return;
        }

        if (!data.session.user.email_confirmed_at) {
          if (active) navigate({ to: "/auth", search: { verify: "pending" }, replace: true });
          return;
        }

        try {
          await ensureBusinessProfile();
        } catch (profileError) {
          console.error("[auth-callback] business_profiles bootstrap failed", profileError);
          if (active) navigate({ to: "/auth/onboarding", search: { verify: undefined }, replace: true });
          return;
        }

        const destination = await getPostAuthDestination(data.session.user.id);
        if (!active) return;
        if (destination === "/auth/onboarding") {
          navigate({ to: destination, search: { verify: undefined }, replace: true });
        } else {
          navigate({ to: destination, replace: true });
        }
      } catch (error) {
        console.error("[auth-callback] Unexpected authentication error", error);
        if (active) navigate({ to: "/auth", search: { verify: undefined }, replace: true });
      }
    }

    void finishAuthentication();
    return () => { active = false; };
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-foreground text-background"><Sparkles className="h-6 w-6" /></span>
        <h1 className="text-lg font-semibold tracking-tight">Authenticating…</h1>
        <p className="mt-1 text-sm text-muted-foreground">Preparing your merchant workspace.</p>
        <div className="mx-auto mt-4 h-1 w-32 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}
