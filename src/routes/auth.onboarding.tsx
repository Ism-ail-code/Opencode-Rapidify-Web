import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { completeOnboarding, devQuickSetup } from "@/lib/merchant.functions";
import type { OnboardingInput } from "@/lib/merchant.functions";

const isDev = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEVELOPER_TOOLS === "true";

export const Route = createFileRoute("/auth/onboarding")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/auth", search: { verify: undefined } });
    }

    let { data: profile, error } = await supabase
      .from("business_profiles")
      .select("id, onboarding_completed_at")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("[onboarding] Failed to read business profile", {
        userId: session.user.id,
        message: error.message,
        code: error.code,
      });
    }

    if (!profile?.onboarding_completed_at) {
      // Fallback: check app_metadata (works even without custom tables)
      if (session.user.app_metadata?.onboarding_completed_at) {
        profile = { id: session.user.id, onboarding_completed_at: session.user.app_metadata.onboarding_completed_at as string };
      } else {
        // Fallback: check profiles table
        const { data: fallbackProfile } = await supabase
          .from("profiles")
          .select("id, onboarding_completed_at")
          .eq("id", session.user.id)
          .maybeSingle();
        if (fallbackProfile?.onboarding_completed_at) {
          profile = fallbackProfile;
        }
      }
    }

    if (profile?.onboarding_completed_at) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Set up your store — Rapidify" },
      {
        name: "description",
        content: "Complete your business profile to get started with Rapidify.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

const MARKETPLACE_OPTIONS = [
  { value: "shopify", label: "Shopify" },
  { value: "daraz", label: "Daraz" },
  { value: "amazon", label: "Amazon" },
  { value: "other", label: "Other" },
] as const;

function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    marketplace: "other" as OnboardingInput["marketplace"],
    storeDomain: "",
    country: "",
    businessEmail: "",
    sellerId: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const requiredFilled = Boolean(
    form.fullName.trim() &&
    form.businessName.trim() &&
    form.storeDomain.trim() &&
    form.country.trim() &&
    form.businessEmail.trim(),
  );

  async function handleQuickSetup() {
    if (loading) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const result = await devQuickSetup();
      if (!result?.success) throw new Error("Demo setup failed. Please try again.");
      toast.success("Demo workspace ready!");
      // Refresh the session so route guards see the updated app_metadata
      await supabase.auth.refreshSession();
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Demo setup failed.";
      console.error("[onboarding] dev quick setup failed", error);
      setSubmitError(message);
      toast.error(message, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!requiredFilled || loading) return;

    setLoading(true);
    setSubmitError(null);
    try {
      const result = await completeOnboarding({
        data: {
          fullName: form.fullName.trim(),
          businessName: form.businessName.trim(),
          marketplace: form.marketplace,
          storeDomain: form.storeDomain.trim(),
          country: form.country.trim(),
          businessEmail: form.businessEmail.trim(),
          sellerId: form.sellerId.trim(),
        },
      });

      if (!result?.success) throw new Error("Business profile was not saved. Please try again.");
      setSuccess(true);
      toast.success("Merchant profile saved. Your workspace is ready.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We could not save your merchant profile. Please try again.";
      console.error("[onboarding] business_profiles insert/update failed", error);
      setSubmitError(message);
      toast.error(message, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20";
  const labelClass = "text-xs font-medium text-slate-700";

  if (success) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Your workspace is ready
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your business profile and merchant workspace were saved successfully.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard", replace: true })}
            className="mt-6 w-full rounded-lg bg-slate-950 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Open dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          Rapidify
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Set up your merchant profile
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          This information is used to create your isolated merchant workspace.
        </p>

        {submitError && (
          <div
            role="alert"
            className="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {isDev && (
          <div className="mt-5 rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
              <Zap className="h-4 w-4" /> Developer quick setup
            </div>
            <p className="mt-1 text-xs text-blue-600">
              Skip the form and jump straight to the dashboard with demo data.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={handleQuickSetup}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Setting up…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Quick Demo Setup
                </>
              )}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className={labelClass}>
              Representative Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.fullName}
              onChange={(event) => update("fullName", event.target.value)}
              placeholder="Jane Doe"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.businessName}
              onChange={(event) => update("businessName", event.target.value)}
              placeholder="Acme Commerce"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Marketplace <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.marketplace}
              onChange={(event) => update("marketplace", event.target.value)}
              className={inputClass}
            >
              {MARKETPLACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Store URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              required
              value={form.storeDomain}
              onChange={(event) => update("storeDomain", event.target.value)}
              placeholder="https://store.example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Country <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.country}
              onChange={(event) => update("country", event.target.value)}
              placeholder="Pakistan"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Business Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={form.businessEmail}
              onChange={(event) => update("businessEmail", event.target.value)}
              placeholder="contact@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Seller ID <span className="text-slate-400">(optional)</span>
            </label>
            <input
              value={form.sellerId}
              onChange={(event) => update("sellerId", event.target.value)}
              placeholder="SELLER123"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={!requiredFilled || loading}
            className="mt-2 flex w-full items-center justify-center rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving merchant profile…
              </>
            ) : (
              "Complete setup"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
