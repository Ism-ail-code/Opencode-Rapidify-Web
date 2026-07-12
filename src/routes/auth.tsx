import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, CheckCircle, ArrowLeft, Mail, Info } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Rapidify" },
      { name: "description", content: "Sign in to your Rapidify merchant dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    verify: (search.verify as string) || undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verify } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [unregisteredNotice, setUnregisteredNotice] = useState(false);

  const isExactAuth = location.pathname === "/auth";

  useEffect(() => {
    if (isExactAuth) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          navigate({ to: "/dashboard", replace: true });
        }
      });
    }
  }, [navigate, isExactAuth]);

  if (!isExactAuth) {
    return <Outlet />;
  }

  function resetForm() {
    setEmail("");
    setPassword("");
  }

  function toggleMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    resetForm();
    setSignupSuccess(false);
    setForgotPassword(false);
    setResetSent(false);
    setUnregisteredNotice(false);
  }

  async function handleGoogleOAuth() {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/onboarding`,
            data: {
              email_confirmed: false,
            },
          },
        });
        if (error) throw error;

        if (data.user && !data.session) {
          setSignupSuccess(true);
          setUnregisteredNotice(false);
          resetForm();
          toast.success("Check your email for the verification link!");
        } else if (data.session) {
          setUnregisteredNotice(false);
          toast.success("Account created! Welcome to Rapidify!");
          navigate({ to: "/dashboard", replace: true });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("invalid login credentials") || msg.includes("user not found") || msg.includes("invalid email")) {
            setUnregisteredNotice(true);
            setMode("signup");
            setSignupSuccess(false);
            setForgotPassword(false);
            setResetSent(false);
            return;
          }
          throw error;
        }

        if (data.user && !data.user.email_confirmed_at) {
          toast.error("Please verify your email before signing in. Check your inbox.");
          await supabase.auth.signOut();
          return;
        }

        toast.success("Welcome back!");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  if (signupSuccess) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
          ← Go Back
        </button>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-foreground/5">
            <CheckCircle className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a verification link to <span className="font-medium text-foreground">{email || "your email"}</span>.
            Click the link to activate your account.
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => { setSignupSuccess(false); setMode("signin"); }}
              className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Go to sign in
            </button>
            <button
              onClick={() => { setSignupSuccess(false); resetForm(); }}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted transition"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verify === "pending") {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
          ← Go Back
        </button>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-foreground/5">
            <ArrowLeft className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Email not verified</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is pending email verification. Please check your inbox and click the confirmation link before signing in.
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => navigate({ to: "/auth", search: { verify: undefined }, replace: true })}
              className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Forgot Password — email entry state
  if (forgotPassword && !resetSent) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
          ← Go Back
        </button>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your registered business email address and we'll send you a secure recovery link.
          </p>
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
              />
            </div>
            <button
              disabled={resetLoading}
              className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
            >
              {resetLoading ? "Sending..." : "Send recovery link"}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <button
              onClick={() => { setForgotPassword(false); setResetSent(false); setResetEmail(""); }}
              className="font-medium text-foreground hover:underline"
            >
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Forgot Password — sent confirmation state
  if (forgotPassword && resetSent) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
          ← Go Back
        </button>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-foreground/5">
            <Mail className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account matches this email address, a secure password recovery link has been dispatched to your inbox.
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => { setForgotPassword(false); setResetSent(false); setResetEmail(""); }}
              className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Back to sign in
            </button>
            <button
              onClick={() => { setResetSent(false); }}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted transition"
            >
              Try a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
        ← Go Back
      </button>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
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

        {/* Google OAuth Button */}
        <button
          onClick={handleGoogleOAuth}
          disabled={googleLoading || loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
        >
          {googleLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          Continue with Google
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Unregistered Email Notice */}
        {unregisteredNotice && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">This email is not registered yet.</p>
              <p className="mt-0.5 text-xs text-blue-600">Redirecting you to account creation — your email is preserved below.</p>
            </div>
            <button
              type="button"
              onClick={() => setUnregisteredNotice(false)}
              className="ml-auto shrink-0 text-blue-400 hover:text-blue-600"
            >
              ×
            </button>
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => { setForgotPassword(true); setResetEmail(email); }}
                  className="text-sm text-slate-500 hover:text-[#2563EB] cursor-pointer transition-colors duration-150"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
            />
          </div>
          <button
            disabled={loading || googleLoading}
            className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button onClick={toggleMode} className="font-medium text-foreground hover:underline">
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
