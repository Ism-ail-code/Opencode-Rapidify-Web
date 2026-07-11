import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your store — Rapidify" },
      { name: "description", content: "Complete your merchant profile to get started with Rapidify." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

interface FormState {
  fullName: string;
  corporateTitle: string;
  storeDomain: string;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormState>({
    fullName: "",
    corporateTitle: "",
    storeDomain: "",
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canSubmit = form.fullName.trim() && form.corporateTitle.trim() && form.storeDomain.trim() && !loading;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const slug = form.corporateTitle
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        const merchantId = crypto.randomUUID();

        const { error: merchantError } = await supabase.from("merchants").insert({
          id: merchantId,
          owner_id: session.user.id,
          name: form.corporateTitle.trim(),
          slug,
          store_domain: form.storeDomain.trim(),
        });

        if (merchantError) throw merchantError;

        const { error: memberError } = await supabase.from("merchant_members").insert({
          merchant_id: merchantId,
          user_id: session.user.id,
          role: "owner",
        });

        if (memberError) throw memberError;

        toast.success("Store created! Welcome to Rapidify.");
        navigate({ to: "/dashboard", replace: true });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Something went wrong. Please try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [form, canSubmit, navigate]
  );

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20";

  return (
    <div className="grid min-h-screen place-items-center px-4 bg-[#F8FAFC]">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
          Set up your store
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Complete your business profile to activate your merchant workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Administrator Information */}
          <div className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Administrator Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Administrator Name
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
                <label className="text-xs font-medium text-slate-600">
                  Legal Company Name
                </label>
                <input
                  type="text"
                  required
                  value={form.corporateTitle}
                  onChange={(e) => update("corporateTitle", e.target.value)}
                  placeholder="Acme Corp Pvt. Ltd."
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Store Platform Domain URL
                </label>
                <input
                  type="url"
                  required
                  value={form.storeDomain}
                  onChange={(e) => update("storeDomain", e.target.value)}
                  placeholder="https://storedomain.com"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating your store..." : "Complete Setup"}
          </button>

          <p className="text-center text-[11px] text-slate-400">
            By continuing, you agree to Rapidify's Terms of Service and Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  );
}
