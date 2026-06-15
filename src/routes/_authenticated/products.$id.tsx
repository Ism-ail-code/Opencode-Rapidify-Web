import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { ProductForm } from "@/components/ProductForm";
import { ARViewer } from "@/components/ARViewer";
import { useServerFn } from "@tanstack/react-start";
import { getMyProduct, upsertProduct, deleteProduct } from "@/lib/products.functions";
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
    </DashboardShell>
  );
}
