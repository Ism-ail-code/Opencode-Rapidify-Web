import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/DashboardShell";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { getMyMerchant } from "@/lib/merchant.functions";
import { supabase } from "@/integrations/supabase/client";
import { Store, Plug, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

const merchantOpts = queryOptions({ queryKey: ["my-merchant"], queryFn: () => getMyMerchant() });

interface PlatformConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  placeholder: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Sync your Shopify product catalog, inventory levels, and order data in real-time.",
    icon: "🛍️",
    color: "bg-emerald-500/10 text-emerald-600",
    placeholder: "shpat_xxxxxxxxxxxxxxxxxxxx",
  },
  {
    id: "daraz",
    name: "Daraz",
    description: "Connect your Daraz Seller Center account to import products and sync stock levels.",
    icon: "🏪",
    color: "bg-orange-500/10 text-orange-600",
    placeholder: "daraz_seller_api_token",
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Link your WordPress WooCommerce store via REST API keys for product synchronization.",
    icon: "🛒",
    color: "bg-purple-500/10 text-purple-600",
    placeholder: "ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
];

function ConnectionCard({ platform, merchantId, existingConnection }: {
  platform: PlatformConfig;
  merchantId: string;
  existingConnection?: { status: string; store_name: string } | null;
}) {
  const [token, setToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const queryClient = useQueryClient();

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error("Please enter an API token");
      return;
    }
    setIsConnecting(true);
    try {
      const { error } = await supabase.from("marketplace_connections").insert({
        merchant_id: merchantId,
        platform: platform.id,
        oauth_token_hash: btoa(token.trim()),
        store_name: `${platform.name} Store`,
        status: "pending",
      });
      if (error) throw error;
      toast.success(`${platform.name} connection initiated. Sync will begin shortly.`);
      setToken("");
      queryClient.invalidateQueries({ queryKey: ["my-merchant"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  const isConnected = existingConnection?.status === "active";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${platform.color}`}>
            {platform.icon}
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">{platform.name}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{platform.description}</p>
          </div>
        </div>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        )}
        {!isConnected && existingConnection && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" /> Pending
          </span>
        )}
      </div>

      {isConnected ? (
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
            Store: {existingConnection?.store_name || platform.name}
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-[#0F172A] transition hover:bg-slate-50">
            <ExternalLink className="h-3.5 w-3.5" /> Manage
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-500">API Client Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={platform.placeholder}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting || !token.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plug className="h-4 w-4" />
            {isConnecting ? "Connecting..." : "Sync Store Inventory"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const { data: merchant, isLoading } = useQuery(merchantOpts);

  if (isLoading) {
    return (
      <DashboardShell title="Settings">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </DashboardShell>
    );
  }

  if (!merchant) {
    return (
      <DashboardShell title="Settings">
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Store className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Complete your merchant profile first to access marketplace connections.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Settings">
      <div className="space-y-8">
        {/* Marketplace Connections Section */}
        <div>
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-[#0F172A]">Marketplace Connections</h2>
            <p className="mt-1 text-sm text-slate-500">
              Link your external stores to sync product catalogs, inventory, and pricing data.
            </p>
          </div>
          <div className="space-y-4">
            {PLATFORMS.map((platform) => (
              <ConnectionCard
                key={platform.id}
                platform={platform}
                merchantId={merchant.id}
                existingConnection={null}
              />
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
