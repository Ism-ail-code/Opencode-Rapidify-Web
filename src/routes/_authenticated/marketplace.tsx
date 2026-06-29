import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { listExternalCatalogItems, approveCatalogItem, rejectCatalogItem, listMarketplaceConnections, createMarketplaceConnection, syncExternalInventory } from "@/lib/marketplace.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import { RefreshCw, Check, X, Store, Link as LinkIcon, Package, AlertCircle } from "lucide-react";

const catalogItemsOpts = queryOptions({
  queryKey: ["external-catalog-items"],
  queryFn: () => listExternalCatalogItems({ data: { status: "pending" } }),
});

const connectionsOpts = queryOptions({
  queryKey: ["marketplace-connections"],
  queryFn: () => listMarketplaceConnections(),
});

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const qc = useQueryClient();
  const { data: connections } = useSuspenseQuery(connectionsOpts);
  const { data: pendingItems } = useSuspenseQuery(catalogItemsOpts);

  const approve = useServerFn(approveCatalogItem);
  const reject = useServerFn(rejectCatalogItem);
  const sync = useServerFn(syncExternalInventory);
  const createConn = useServerFn(createMarketplaceConnection);

  const [syncing, setSyncing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [newVendor, setNewVendor] = useState<"daraz" | "amazon" | "shopify">("daraz");
  const [newStoreUrl, setNewStoreUrl] = useState("");

  const handleApprove = async (itemId: string) => {
    try {
      await approve({ data: { item_id: itemId } });
      toast.success("Item approved and synced");
      await qc.invalidateQueries({ queryKey: ["external-catalog-items"] });
      await qc.invalidateQueries({ queryKey: ["my-products"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleReject = async (itemId: string) => {
    try {
      await reject({ data: { item_id: itemId } });
      toast.success("Item rejected");
      await qc.invalidateQueries({ queryKey: ["external-catalog-items"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleSync = async (connectionId: string) => {
    setSyncing(connectionId);
    try {
      await sync({ data: { connection_id: connectionId } });
      toast.success("Sync complete");
      await qc.invalidateQueries({ queryKey: ["external-catalog-items"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); }
    setSyncing(null);
  };

  const handleConnect = async () => {
    if (!newStoreUrl.trim()) { toast.error("Store URL is required"); return; }
    setConnecting(true);
    try {
      await createConn({ data: { vendor: newVendor, store_url: newStoreUrl.trim(), access_token: "pending" } });
      toast.success("Connection created. Run a sync to fetch products.");
      await qc.invalidateQueries({ queryKey: ["marketplace-connections"] });
      setNewStoreUrl("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setConnecting(false);
  };

  return (
    <DashboardShell title="Marketplace">
      <div className="space-y-6">
        {/* Connections */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Store className="h-4 w-4" /> Connections
            </h2>
          </div>
          <div className="rounded-2xl glass p-4">
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No marketplace connections. Connect your first store below.</p>
            ) : (
              <div className="space-y-3">
                {connections.map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-muted/30 border border-border/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-[10px] font-semibold uppercase">{c.vendor}</span>
                      <div>
                        <p className="text-sm font-medium">{c.store_url}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.is_active ? "Active" : "Inactive"}
                          {c.last_sync_at ? ` · Last sync ${new Date(c.last_sync_at).toLocaleDateString()}` : " · Never synced"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSync(c.id)}
                      disabled={syncing === c.id}
                      className="flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncing === c.id ? "animate-spin" : ""}`} />
                      {syncing === c.id ? "Syncing…" : "Sync now"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new connection */}
            <div className="mt-4 rounded-xl border border-dashed border-border p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">Add marketplace connection</p>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  value={newVendor}
                  onChange={e => setNewVendor(e.target.value as typeof newVendor)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="daraz">Daraz</option>
                  <option value="amazon">Amazon</option>
                  <option value="shopify">Shopify</option>
                </select>
                <input
                  type="url"
                  placeholder="https://your-store.myshopify.com"
                  value={newStoreUrl}
                  onChange={e => setNewStoreUrl(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleConnect}
                  disabled={connecting || !newStoreUrl.trim()}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  {connecting ? "Connecting…" : "Connect"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pending catalog items */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Package className="h-4 w-4" /> Pending Catalog Items
            {pendingItems.length > 0 && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold">{pendingItems.length}</span>
            )}
          </h2>
          <div className="rounded-2xl glass">
            {pendingItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <AlertCircle className="mx-auto mb-2 h-6 w-6 opacity-40" />
                No pending items to review
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {pendingItems.map(item => (
                  <div key={item.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20">
                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">
                      {item.image_urls?.[0] && <img src={item.image_urls[0]} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {item.external_sku}
                        {item.price_cents != null ? ` · $${(item.price_cents / 100).toFixed(2)}` : ""}
                        {item.marketplace_connections?.platform ? ` · ${item.marketplace_connections.platform}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(item.id)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-500/10 text-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500/20"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        className="flex items-center gap-1 rounded-lg bg-red-500/10 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-500/20"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
