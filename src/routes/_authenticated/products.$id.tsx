import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { ProductForm } from "@/components/ProductForm";
import { ARViewer } from "@/components/ARViewer";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { useServerFn } from "@tanstack/react-start";
import { getMyProduct, upsertProduct, deleteProduct } from "@/lib/products.functions";
import { getProcessingJobs } from "@/lib/jobs.functions";
import { getMyMerchant } from "@/lib/merchant.functions";
import { toast } from "sonner";
import { useState } from "react";
import { ChevronDown, ChevronRight, Code2 } from "lucide-react";

const opts = (id: string) => queryOptions({ queryKey: ["my-product", id], queryFn: () => getMyProduct({ data: { id } }) });
const merchantOpts = queryOptions({ queryKey: ["my-merchant"], queryFn: () => getMyMerchant() });

export const Route = createFileRoute("/_authenticated/products/$id")({
  head: () => ({ meta: [{ title: "Edit product — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(opts(id));
  const { data: merchant } = useSuspenseQuery(merchantOpts);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(upsertProduct);
  const del = useServerFn(deleteProduct);
  const product = data.product;
  const merchantSlug = merchant?.slug || "";

  const { data: processingJobs } = useSuspenseQuery(
    queryOptions({
      queryKey: ["processing-jobs", id],
      queryFn: () => getProcessingJobs(),
      select: (jobs) => jobs.filter(job => job.product_id === id),
    })
  );

  const [showPerProduct, setShowPerProduct] = useState(false);

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case "ready": return "bg-foreground/10 text-foreground";
      case "failed": return "bg-red-500/10 text-red-600";
      case "processing": return "bg-blue-500/10 text-blue-600";
      case "optimizing": return "bg-purple-500/10 text-purple-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (!product) return <DashboardShell title="Not found"><p className="text-muted-foreground">Product not found.</p></DashboardShell>;

  return (
    <DashboardShell title={product.title}>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/products" className="text-sm text-muted-foreground hover:text-foreground transition">
          ← Back to products
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <ProductForm initial={product} onSubmit={async (d) => {
          try {
            await save({ data: { ...d, id: product.id } });
            await qc.invalidateQueries({ queryKey: ["my-product", id] });
            await qc.invalidateQueries({ queryKey: ["my-products"] });
            toast.success("Saved");
          } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
        }} onDelete={async () => {
          if (!confirm("Delete this product?")) return;
          await del({ data: { id: product.id } });
          toast.success("Deleted");
          navigate({ to: "/products" });
        }} />

        <div className="space-y-4">
          {/* AR Preview */}
          <div className="rounded-xl border border-border bg-card p-2">
            <ARViewer glb={product.model_glb_url} usdz={product.model_usdz_url} poster={product.thumbnail_url} alt={product.title} />
          </div>

          {/* Processing Jobs */}
          {processingJobs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Processing Jobs</h3>
              <ul className="space-y-2">
                {processingJobs.map(j => (
                  <li key={j.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{j.provider}</span>
                      <span className="font-mono text-[10px]">{j.id.slice(0, 8)}</span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getJobStatusColor(j.status)}`}>{j.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Global Embed Script (Recommended) */}
          {merchantSlug && (
            <EmbedSnippet merchantSlug={merchantSlug} />
          )}

          {/* Per-Product Embed Script (Advanced) */}
          {merchantSlug && product.external_sku && (
            <div className="rounded-xl border border-border bg-card">
              <button
                onClick={() => setShowPerProduct(!showPerProduct)}
                className="flex w-full items-center gap-2 p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                {showPerProduct ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Code2 className="h-3.5 w-3.5" />
                Advanced: Per-Product Script
              </button>
              {showPerProduct && (
                <div className="px-4 pb-4">
                  <EmbedSnippet merchantSlug={merchantSlug} externalSku={product.external_sku} productName={product.title} />
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Only use this if the global script's auto-detection does not work for this specific product.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
