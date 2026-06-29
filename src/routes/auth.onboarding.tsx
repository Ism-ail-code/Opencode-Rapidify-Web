import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { completeOnboarding } from "@/lib/merchant.functions";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

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

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [corporateTitle, setCorporateTitle] = useState("");
  const [brandName, setBrandName] = useState("");
  const [storeDomain, setStoreDomain] = useState("");

  const slug = useMemo(() => {
    return brandName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }, [brandName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await completeOnboarding({ data: { fullName, corporateTitle, brandName, storeDomain } });
      await queryClient.invalidateQueries();
      toast.success("Store created! Welcome to Rapidify.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <button type="button" onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-[#2563EB] font-medium transition-colors duration-150 absolute top-6 left-6 flex items-center gap-1.5 cursor-pointer">
        ← Go Back
      </button>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background"><Sparkles className="h-3.5 w-3.5" /></span>
          Rapidify
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Set up your store</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us about yourself and your business to get started.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Individual Information */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Information</h2>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Full Legal Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Corporate Title</label>
              <input
                type="text"
                required
                value={corporateTitle}
                onChange={(e) => setCorporateTitle(e.target.value)}
                placeholder="Founder & CEO"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
              />
            </div>
          </div>

          {/* Enterprise Store */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Details</h2>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Business / Brand Name</label>
              <input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Sana Safinaz Outlet"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
              />
              {slug && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Store URL: <span className="font-medium text-foreground">rapidify.app/{slug}</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Store E-Commerce Domain / URL</label>
              <input
                type="url"
                value={storeDomain}
                onChange={(e) => setStoreDomain(e.target.value)}
                placeholder="https://store-domain.com"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-1 focus:ring-foreground/20"
              />
            </div>
          </div>

          <button
            disabled={loading || !slug}
            className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Creating your store..." : "Launch my store"}
          </button>
        </form>
      </div>
    </div>
  );
}
