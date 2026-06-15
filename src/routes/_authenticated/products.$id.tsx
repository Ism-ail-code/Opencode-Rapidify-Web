import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { ProductForm } from "@/components/ProductForm";
import { ARViewer } from "@/components/ARViewer";
import { useServerFn } from "@tanstack/react-start";
import { getMyProduct, upsertProduct, deleteProduct } from "@/lib/products.functions";
import { getProcessingJobs, processJob } from "@/lib/jobs.functions";
import { toast } from "sonner";

const opts = (id: string) => queryOptions({ queryKey: ["my-product", id], queryFn: () => getMyProduct({ data: { id } }) });

export const Route = createFileRoute("/_authenticated/products/$id")({
  head: () => ({ meta: [{ title: "Edit product — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(opts(id));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(upsertProduct);
  const del = useServerFn(deleteProduct);
  const product = data.product;
  
  // Get processing jobs for this product
  const { data: processingJobs } = useSuspenseQuery(
    queryOptions({
      queryKey: ["processing-jobs", id],
      queryFn: () => getProcessingJobs(),
      select: (jobs) => jobs.filter(job => job.product_id === id),
    })
  );
  
  const getJobStatusColor = (status: string) => {
    switch (status) {
      case "ready": return "bg-emerald-500/20 text-emerald-300";
      case "failed": return "bg-red-500/20 text-red-300";
      case "processing": return "bg-blue-500/20 text-blue-300";
      case "optimizing": return "bg-purple-500/20 text-purple-300";
      default: return "bg-amber-500/20 text-amber-300";
    }
  };

  if (!product) return <DashboardShell title="Not found"><p className="text-muted-foreground">Product not found.</p></DashboardShell>;
  return (
    <DashboardShell title={product.title}>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/p/$slug" params={{ slug: product.slug }} className="text-sm text-muted-foreground hover:text-foreground">View public page →</Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
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
        <div className="rounded-2xl glass p-3">
          <ARViewer glb={product.model_glb_url} usdz={product.model_usdz_url} poster={product.thumbnail_url} alt={product.title} />
        </div>
      </div>
      
      {processingJobs.length > 0 && (
        <div className="rounded-2xl glass p-5">
          <h3 className="mb-3 text-sm font-medium">Processing Jobs</h3>
          <ul className="space-y-2 text-sm">
            {processingJobs.map(j => (
              <li key={j.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{j.provider}</span>
                  <span className="font-mono text-xs">{j.id.slice(0, 8)}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getJobStatusColor(j.status)}`}>{j.status}</span>
                <span className="text-xs text-muted-foreground">{j.retries || 0}/{j.max_retries || 5} retries</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardShell>
  );
}
