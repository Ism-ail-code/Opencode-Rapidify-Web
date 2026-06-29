import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Authenticating — Rapidify" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // Supabase exchanges the auth code for a session
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Auth callback error:", error);
          navigate({ to: "/auth", replace: true });
          return;
        }

        if (data.session) {
          const user = data.session.user;

          // Check if email is verified (OAuth users are pre-verified)
          if (!user.email_confirmed_at) {
            navigate({ to: "/auth?verify=pending", replace: true });
            return;
          }

          // Check if user has completed onboarding
          const { data: member } = await supabase
            .from("merchant_members")
            .select("merchant_id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!member) {
            navigate({ to: "/auth/onboarding", replace: true });
          } else {
            navigate({ to: "/dashboard", replace: true });
          }
        } else {
          // No session, check URL hash for tokens
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get("access_token");

          if (accessToken) {
            // Wait a moment for Supabase to process the session
            await new Promise((resolve) => setTimeout(resolve, 500));

            const { data: retryData } = await supabase.auth.getSession();
            if (retryData.session) {
              const user = retryData.session.user;
              const { data: member } = await supabase
                .from("merchant_members")
                .select("merchant_id")
                .eq("user_id", user.id)
                .maybeSingle();

              if (!member) {
                navigate({ to: "/auth/onboarding", replace: true });
              } else {
                navigate({ to: "/dashboard", replace: true });
              }
              return;
            }
          }

          navigate({ to: "/auth", replace: true });
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        navigate({ to: "/auth", replace: true });
      }
    };

    handleAuth();
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <span className="grid h-12 w-12 mx-auto place-items-center rounded-xl bg-foreground text-background mb-4">
          <Sparkles className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">Authenticating...</h1>
        <p className="mt-1 text-sm text-muted-foreground">Please wait while we verify your account.</p>
        <div className="mt-4 mx-auto h-1 w-32 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}
