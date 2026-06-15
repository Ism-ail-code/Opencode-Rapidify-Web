import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProductForm } from "@/components/ProductForm";
import { DashboardShell } from "@/components/DashboardShell";
import { useServerFn } from "@tanstack/react-start";
import { upsertProduct } from "@/lib/products.functions";
import { getProcessingJobs } from "@/lib/jobs.functions";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: "New product — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const save = useServerFn(upsertProduct);
  
  // Get processing jobs to show after creation
  const { data: processingJobs } = useSuspenseQuery(
    queryOptions({
      queryKey: ["processing-jobs"],
      queryFn: () => getProcessingJobs(),
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

  return (
    <DashboardShell title="New product">
      <ProductForm onSubmit={async (data) => {
        try {
          const product = await save({ data });
          toast.success("Product created");
          navigate({ to: "/products/$id", params: { id: product.id } });
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
      }} />
      
      {processingJobs.length > 0 && (
        <div className="mt-6 rounded-2xl glass p-5">
          <h3 className="mb-3 text-sm font-medium">Recent Processing Jobs</h3>
          <ul className="space-y-2 text-sm">
            {processingJobs.slice(0, 3).map(j => (
              <li key={j.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{j.provider}</span>
                  <span className="font-mono text-xs">{j.id.slice(0, 8)}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getJobStatusColor(j.status)}`}>{j.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardShell>
  );
}
