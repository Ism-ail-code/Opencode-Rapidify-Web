import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ARViewer } from "@/components/ARViewer";
import { getPublicProduct } from "@/lib/products.functions";
import { track } from "@/lib/track";

const productOpts = (slug: string) =>
  queryOptions({ queryKey: ["embed-product", slug], queryFn: () => getPublicProduct({ data: { slug } }) });

export const Route = createFileRoute("/embed/$slug")({
  loader: async ({ params, context }) => {
    const res = await context.queryClient.ensureQueryData(productOpts(params.slug));
    if (!res) throw notFound();
    return res;
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }, { title: "Rapidify Embed" }] }),
  errorComponent: () => <div className="p-6 text-center text-sm">Failed to load.</div>,
  notFoundComponent: () => <div className="p-6 text-center text-sm">Not found.</div>,
  component: EmbedPage,
});

function EmbedPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productOpts(slug));
  const product = data!.product;
  useEffect(() => {
    track("embed_open", { product_id: product.id, merchant_id: product.merchant_id });
  }, [product.id, product.merchant_id]);
  return (
    <div className="grid h-screen place-items-center p-2">
      <div className="h-full w-full">
        <ARViewer glb={product.model_glb_url} usdz={product.model_usdz_url} poster={product.thumbnail_url} alt={product.title}
          onArLaunch={() => track("ar_launch", { product_id: product.id, merchant_id: product.merchant_id, metadata: { source: "embed" } })} />
      </div>
    </div>
  );
}
