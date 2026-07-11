import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { listMyProducts } from "@/lib/products.functions";
import { Plus, ExternalLink, AlertTriangle, Package } from "lucide-react";

const productsOpts = queryOptions({ queryKey: ["my-products"], queryFn: () => listMyProducts() });

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const matchRoute = useMatchRoute();
  const isChild = !!matchRoute({ to: "/products/new" }) || !!matchRoute({ to: "/products/$id" });
  if (isChild) return <Outlet />;
  return <List />;
}

function List() {
  const { data, isLoading, isError } = useQuery(productsOpts);

  if (isLoading) {
    return (
      <DashboardShell title="Products">
        <div className="flex flex-col items-center justify-center rounded-2xl glass px-8 py-20 text-center">
          <p className="text-sm text-muted-foreground">Loading products catalog...</p>
        </div>
      </DashboardShell>
    );
  }

  if (isError) {
    return (
      <DashboardShell title="Products">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#FFFFFF] px-8 py-20 text-center shadow-sm border border-slate-200">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-400" />
          <h3 className="text-lg font-semibold text-[#0F172A]">Syncing your workspace catalog...</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">
            If this takes longer than a few moments, please reload the page or contact support if the issue persists.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      </DashboardShell>
    );
  }

  const productsList = Array.isArray(data) ? data : [];

  if (productsList.length === 0) {
    return (
      <DashboardShell title="Products">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#FFFFFF] px-8 py-20 text-center shadow-sm border border-slate-200">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <Plus className="h-7 w-7 text-[#2563EB]" />
          </div>
          <h3 className="text-lg font-semibold text-[#0F172A]">No Products Synced Yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mt-1 mb-6">
            Connect an external marketplace inventory or manually upload a 3D asset file to get started.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/products/new"
              className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> + Add First Product
            </Link>
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-[#0F172A] transition hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" /> Sync Marketplace Feed
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Products">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{productsList.length} total</p>
        <Link to="/products/new" className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New product
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Updated</th><th></th></tr>
          </thead>
          <tbody>
            {productsList.map((p: any) => (
              <tr key={p?.id ?? Math.random()} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center">
                      <Package className="h-5 w-5 text-slate-300" />
                    </div>
                    <Link to="/products/$id" params={{ id: p?.id ?? "" }} className="font-medium text-[#0F172A] hover:underline">
                      {p?.title || "Untitled"}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    p?.status === "active" ? "bg-emerald-100 text-emerald-700" :
                    p?.status === "draft" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>{p?.status || "unknown"}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {typeof p?.price_cents === "number" ? `$${(p.price_cents / 100).toFixed(2)}` : "$0.00"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {p?.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to="/products/$id" params={{ id: p?.id ?? "" }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#0F172A]">
                    View <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
