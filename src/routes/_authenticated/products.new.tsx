import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProductForm } from "@/components/ProductForm";
import { DashboardShell } from "@/components/DashboardShell";
import { useServerFn } from "@tanstack/react-start";
import { upsertProduct } from "@/lib/products.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: "New product — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const save = useServerFn(upsertProduct);

  return (
    <DashboardShell title="New product">
      <div className="max-w-2xl">
        <ProductForm onSubmit={async (data) => {
          try {
            const product = await save({ data });
            toast.success("Product created");
            navigate({ to: "/products/$id", params: { id: product.id } });
          } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
        }} />
      </div>
    </DashboardShell>
  );
}
