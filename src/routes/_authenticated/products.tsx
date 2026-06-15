import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { listMyProducts } from "@/lib/products.functions";
import { Plus, ExternalLink } from "lucide-react";

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
  const { data: products } = useSuspenseQuery(productsOpts);
  return (
    <DashboardShell title="Products">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products.length} total</p>
        <Link to="/products/new" className="inline-flex items-center gap-2 rounded-lg btn-hero px-4 py-2 text-sm font-medium">
          <Plus className="h-4 w-4" /> New product
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl glass">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Updated</th><th></th></tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-t border-border/50 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">
                      {p.thumbnail_url && <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <Link to="/products/$id" params={{ id: p.id }} className="font-medium hover:underline">{p.title}</Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    p.status === "active" ? "bg-emerald-500/20 text-emerald-300" :
                    p.status === "draft" ? "bg-amber-500/20 text-amber-300" :
                    "bg-muted text-muted-foreground"
                  }`}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">${(p.price_cents/100).toFixed(2)}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link to="/p/$slug" params={{ slug: p.slug }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    View <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No products yet. Create your first AR product.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
