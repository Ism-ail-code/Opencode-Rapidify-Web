import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, CheckCircle, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Rapidify" },
      { name: "description", content: "Sign in to your Rapidify merchant dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  function resetForm() {
    setEmail("");
    setPassword("");
  }

  function toggleMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    resetForm();
    setSignupSuccess(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;

        // Check if user was created and if email confirmation is required
        if (data.user && !data.session) {
          // Email confirmation is required
          setSignupSuccess(true);
          resetForm();
          toast.success("Check your email to confirm your account!");
        } else if (data.session) {
          // Email confirmation is disabled — user is already logged in
          toast.success("Account created! Welcome to Rapidify!");
          navigate({ to: "/dashboard", replace: true });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  // Show email confirmation success screen
  if (signupSuccess) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-md rounded-2xl glass p-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg btn-hero"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email || "your email"}</span>.
            Click the link to activate your account and access your dashboard.
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => { setSignupSuccess(false); setMode("signin"); }}
              className="w-full rounded-lg btn-hero py-2.5 text-sm font-medium"
            >
              Go to sign in
            </button>
            <button
              onClick={() => { setSignupSuccess(false); resetForm(); }}
              className="w-full rounded-lg glass py-2.5 text-sm font-medium hover:bg-muted"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl glass p-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg btn-hero"><Sparkles className="h-3.5 w-3.5" /></span>
          Rapidify
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your store"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to manage your AR products."
            : "Spin up your AR commerce store in seconds."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-border bg-background/50 px-3 py-2.5 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-1 w-full rounded-lg border border-border bg-background/50 px-3 py-2.5 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <button
            disabled={loading}
            className="w-full rounded-lg btn-hero py-2.5 text-sm font-medium transition disabled:opacity-60"
          >
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-transparent px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button onClick={toggleMode} className="font-medium text-foreground hover:underline">
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
