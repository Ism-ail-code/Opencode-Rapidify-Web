import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, CheckCircle, AlertCircle } from "lucide-react";

const BackNav = () => (
  <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
    ← Go Back
  </button>
);

export const Route = createFileRoute("/auth/update-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Rapidify" },
      { name: "description", content: "Set your new Rapidify password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setSessionError(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setSuccess(true);
      toast.success("Password updated successfully. Please log in with your new credentials.");

      // Sign out so the user must re-authenticate with the new password
      await supabase.auth.signOut();

      // Redirect to auth after a short delay so the user sees the success state
      setTimeout(() => {
        navigate({ to: "/auth", search: { verify: undefined }, replace: true });
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  // Invalid / expired token state
  if (sessionError) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <BackNav />
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-foreground/5">
            <AlertCircle className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Link expired or invalid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This password reset link is no longer valid. Please request a new one from the sign-in page.
          </p>
          <div className="mt-6">
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

  // Success state
  if (success) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <BackNav />
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
            Rapidify
          </Link>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-foreground/5">
            <CheckCircle className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Password updated successfully. Please log in with your new credentials.
          </p>
          <div className="mt-6">
            <button
              onClick={() => navigate({ to: "/auth", search: { verify: undefined }, replace: true })}
              className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Go to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // New password form
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <BackNav />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
          Rapidify
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Set new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a strong password for your merchant account.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoFocus
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
            />
          </div>
          <button
            disabled={loading}
            className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <button
            onClick={() => navigate({ to: "/auth", search: { verify: undefined }, replace: true })}
            className="font-medium text-foreground hover:underline"
          >
            Back to sign in
          </button>
        </p>
      </div>
    </div>
  );
}
