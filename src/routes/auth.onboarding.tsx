import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { completeOnboarding } from "@/lib/merchant.functions";
import type { OnboardingInput } from "@/lib/merchant.functions";

export const Route = createFileRoute("/auth/onboarding")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/auth", search: { verify: undefined } });
    }
    const { data: members } = await supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", session.user.id)
      .limit(1);
    if (members && members.length > 0) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Set up your store — Rapidify" },
      { name: "description", content: "Complete your business profile to get started with Rapidify." },
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
  const [result, setResult] = useState<{ isVerified?: boolean } | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    marketplace: "other" as OnboardingInput["marketplace"],
    storeDomain: "",
    country: "",
    businessEmail: "",
    sellerId: "",
    taxVatNumber: "",
    estimatedMonthlyOrders: "",
    webhookUrl: "",
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const requiredFilled = !!(
    form.fullName.trim() &&
    form.businessName.trim() &&
    form.storeDomain.trim() &&
    form.country.trim() &&
    form.businessEmail.trim()
  );

  const canSubmit = requiredFilled && !loading;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setLoading(true);
      console.log("[onboarding] Submitting completeOnboarding with business:", form.businessName);
      try {
        const res = await completeOnboarding({
          data: {
            fullName: form.fullName.trim(),
            businessName: form.businessName.trim(),
            marketplace: form.marketplace,
            storeDomain: form.storeDomain.trim(),
            country: form.country.trim(),
            businessEmail: form.businessEmail.trim(),
            sellerId: form.sellerId.trim() || undefined,
            taxVatNumber: form.taxVatNumber.trim() || undefined,
            estimatedMonthlyOrders: form.estimatedMonthlyOrders ? parseInt(form.estimatedMonthlyOrders, 10) : 0,
            webhookUrl: form.webhookUrl.trim() || undefined,
          },
        });

        console.log("[onboarding] completeOnboarding succeeded:", JSON.stringify(res));
        setResult(res);
        setSuccess(true);
        toast.success(res.isVerified ? "Business verified! Welcome to Rapidify." : "Store created! Complete webhook setup to get verified.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        console.error("[onboarding] Submit FAILED:", err);
        if (err instanceof Error && err.stack) {
          console.error("[onboarding] Stack:", err.stack);
        }
        toast.error(message, { duration: 8000 });
      } finally {
        setLoading(false);
      }
    },
    [form, canSubmit, navigate]
  );

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20";
  const labelClass = "text-xs font-medium text-slate-600";
  const sectionClass = "rounded-xl border border-slate-200 p-5";

  if (success) {
    return (
      <div className="grid min-h-screen place-items-center px-4 py-8 bg-[#F8FAFC]">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
            All set!
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {result?.isVerified
              ? "Your business has been verified. Welcome to Rapidify!"
              : "Your store has been created. Complete webhook setup to get verified."}
          </p>
          <button
            onClick={() => navigate({ to: "/dashboard", replace: true })}
            className="mt-6 w-full rounded-lg bg-[#0F172A] py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8 bg-[#F8FAFC]">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="text-sm text-slate-500 hover:text-[#0F172A] font-medium transition-colors duration-150 absolute top-6 right-6 flex items-center gap-1.5 cursor-pointer"
        >
          ← Go Back
        </button>
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#0F172A]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0F172A] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          Rapidify
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
          Set up your business
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Provide your business information to activate your merchant workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Business Information */}
          <div className={sectionClass}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Business Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>
                  Representative Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  placeholder="Jane Doe"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Business Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.businessName}
                  onChange={(e) => update("businessName", e.target.value)}
                  placeholder="Acme Corp Pvt. Ltd."
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Marketplace <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={form.marketplace}
                  onChange={(e) => update("marketplace", e.target.value)}
                  className={`mt-1 ${inputClass}`}
                >
                  {MARKETPLACE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Store URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={form.storeDomain}
                  onChange={(e) => update("storeDomain", e.target.value)}
                  placeholder="https://mystore.com"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Country <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.country}
                  onChange={(e) => update("country", e.target.value)}
                  placeholder="Pakistan"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Business Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.businessEmail}
                  onChange={(e) => update("businessEmail", e.target.value)}
                  placeholder="contact@acmecorp.com"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
          </div>

          {/* Optional Information */}
          <div className={sectionClass}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Additional Information (Optional)
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Seller ID</label>
                <input
                  type="text"
                  value={form.sellerId}
                  onChange={(e) => update("sellerId", e.target.value)}
                  placeholder="SELLER123"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>Tax / VAT Number</label>
                <input
                  type="text"
                  value={form.taxVatNumber}
                  onChange={(e) => update("taxVatNumber", e.target.value)}
                  placeholder="VAT-XX-XXXXXXX"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>Estimated Monthly Orders</label>
                <input
                  type="number"
                  min="0"
                  value={form.estimatedMonthlyOrders}
                  onChange={(e) => update("estimatedMonthlyOrders", e.target.value)}
                  placeholder="100"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>Webhook URL (for auto-sync)</label>
                <input
                  type="url"
                  value={form.webhookUrl}
                  onChange={(e) => update("webhookUrl", e.target.value)}
                  placeholder="https://mystore.com/webhooks/rapidify"
                  className={`mt-1 ${inputClass}`}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  If provided, we'll test connectivity during setup.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying & setting up...
              </span>
            ) : (
              "Complete Setup"
            )}
          </button>

          <p className="text-center text-[11px] text-slate-400">
            By continuing, you agree to Rapidify's Terms of Service and Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  );
}
