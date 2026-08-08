import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/DashboardShell";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { getMyMerchant } from "@/lib/merchant.functions";
import { listMarketplaceConnections, createMarketplaceConnection, deleteMarketplaceConnection } from "@/lib/marketplace.functions";
import { useServerFn } from "@tanstack/react-start";
import { Store, Plug, CheckCircle2, AlertCircle, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPage,
});

const merchantOpts = queryOptions({ queryKey: ["my-merchant"], queryFn: () => getMyMerchant() });

const connectionsOpts = queryOptions({
  queryKey: ["marketplace-connections"],
  queryFn: () => listMarketplaceConnections(),
});

interface PlatformConfig {
  id: "daraz" | "amazon" | "shopify";
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
    id: "amazon",
    name: "Amazon",
    description: "Connect your Amazon Seller account via SP-API to sync catalog items and offers.",
    icon: "📦",
    color: "bg-blue-500/10 text-blue-600",
    placeholder: "amazon_sp_api_token",
  },
];

interface Connection {
  id: string;
  platform: string;
  store_url: string | null;
  store_name: string;
  status: string;
  last_sync_at: string | null;
}

function ConnectionCard({ platform, merchantId, existingConnection }: {
  platform: PlatformConfig;
  merchantId: string;
  existingConnection?: Connection | null;
}) {
  const [token, setToken] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const queryClient = useQueryClient();
  const createConn = useServerFn(createMarketplaceConnection);
  const deleteConn = useServerFn(deleteMarketplaceConnection);

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error("Please enter an API token");
      return;
    }
    if (!storeUrl.trim()) {
      toast.error("Please enter your store URL");
      return;
    }
    setIsConnecting(true);
    try {
      await createConn({
        data: { vendor: platform.id, store_url: storeUrl.trim(), access_token: token.trim() },
      });
      toast.success(`${platform.name} connection created. Run a sync to fetch your catalog.`);
      setToken("");
      setStoreUrl("");
      queryClient.invalidateQueries({ queryKey: ["marketplace-connections"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!existingConnection) return;
    if (!confirm(`Remove the ${platform.name} connection?`)) return;
    try {
      await deleteConn({ data: { id: existingConnection.id } });
      toast.success(`${platform.name} connection removed`);
      queryClient.invalidateQueries({ queryKey: ["marketplace-connections"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
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
            <AlertCircle className="h-3.5 w-3.5" /> {existingConnection.status}
          </span>
        )}
      </div>

      {isConnected ? (
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
            Store: {existingConnection.store_url || existingConnection.store_name || platform.name}
            {existingConnection.last_sync_at && (
              <span className="text-slate-400"> · Last sync {new Date(existingConnection.last_sync_at).toLocaleDateString()}</span>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-500">Store URL</label>
            <input
              type="url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder={platform.id === "shopify" ? "https://your-store.myshopify.com" : "https://your-store.example.com"}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
            />
          </div>
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
            disabled={isConnecting || !token.trim() || !storeUrl.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plug className="h-4 w-4" />
            {isConnecting ? "Connecting..." : "Connect Store"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const { data: merchant, isLoading } = useQuery(merchantOpts);
  const { data: connections } = useQuery(connectionsOpts);

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
            {PLATFORMS.map((platform) => {
              const existing = (connections ?? []).find((c) => c.platform === platform.id) ?? null;
              return (
                <ConnectionCard
                  key={platform.id}
                  platform={platform}
                  merchantId={merchant.id}
                  existingConnection={existing}
                />
              );
            })}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
