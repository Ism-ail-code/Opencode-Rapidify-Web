import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { ARViewer } from "@/components/ARViewer";
import { QRModal } from "@/components/QRModal";
import { getPublicProduct } from "@/lib/products.functions";
import { track } from "@/lib/track";
import { QrCode, ShoppingBag, Smartphone } from "lucide-react";

const productOpts = (slug: string) =>
  queryOptions({ queryKey: ["product", slug], queryFn: () => getPublicProduct({ data: { slug } }) });

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params, context }) => {
    const res = await context.queryClient.ensureQueryData(productOpts(params.slug));
    if (!res) throw notFound();
    return res;
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.product.title ?? "Product";
    const desc = loaderData?.product.description?.slice(0, 160) ?? "View this product in augmented reality.";
    const img = loaderData?.product.thumbnail_url;
    return {
      meta: [
        { title: `${title} — Rapidify AR` },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `/p/${params.slug}` },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
      ],
      links: [{ rel: "canonical", href: `/p/${params.slug}` }],
      scripts: loaderData ? [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org", "@type": "Product",
          name: loaderData.product.title,
          description: loaderData.product.description,
          image: loaderData.product.thumbnail_url,
          offers: { "@type": "Offer", priceCurrency: loaderData.product.currency, price: (loaderData.product.price_cents / 100).toFixed(2) },
        }),
      }] : [],
    };
  },
  errorComponent: () => (<div className="p-10 text-center text-muted-foreground">Failed to load product.</div>),
  notFoundComponent: () => (<div className="p-10 text-center text-muted-foreground">Product not found.</div>),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productOpts(slug));
  const [qrOpen, setQrOpen] = useState(false);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);

  const product = data!.product;
  const variants = data!.variants;
  const current = variants.find(v => v.id === activeVariant) ?? null;
  const glb = current?.model_glb_url ?? product.model_glb_url;
  const usdz = current?.model_usdz_url ?? product.model_usdz_url;
  const poster = current?.thumbnail_url ?? product.thumbnail_url;

  useEffect(() => {
    track("page_view", { product_id: product.id, merchant_id: product.merchant_id });
    track("product_view", { product_id: product.id, merchant_id: product.merchant_id });
  }, [product.id, product.merchant_id]);

  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;

  return (
    <div>
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-2">
        <div className="rounded-2xl glass p-3">
          <ARViewer glb={glb} usdz={usdz} poster={poster} alt={product.title}
            onArLaunch={() => track("ar_launch", { product_id: product.id, merchant_id: product.merchant_id })}
            onArSessionEnd={() => track("ar_session_end", { product_id: product.id, merchant_id: product.merchant_id })}
          />
        </div>
        <div className="flex flex-col">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {product.merchants?.name ?? "Store"}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{product.title}</h1>
          <div className="mt-3 text-2xl font-medium">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency }).format(product.price_cents / 100)}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>

          {variants.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Variants</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {variants.map(v => (
                  <button key={v.id}
                    onClick={() => { setActiveVariant(v.id); track("variant_switch", { product_id: product.id, merchant_id: product.merchant_id, variant_id: v.id }); }}
                    className={`rounded-lg px-3 py-2 text-sm transition ${activeVariant === v.id ? "btn-hero" : "glass hover:bg-muted"}`}>
                    {v.color_hex && <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: v.color_hex }} />}
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={product.buy_url || "#"} onClick={() => {
              track("add_to_cart", { product_id: product.id, merchant_id: product.merchant_id });
              track("buy_click", { product_id: product.id, merchant_id: product.merchant_id });
            }}
              className="inline-flex items-center gap-2 rounded-lg btn-hero px-5 py-3 text-sm font-medium">
              <ShoppingBag className="h-4 w-4" /> Buy now
            </a>
            <button onClick={() => { setQrOpen(true); track("qr_open", { product_id: product.id, merchant_id: product.merchant_id }); }}
              className="inline-flex items-center gap-2 rounded-lg glass px-5 py-3 text-sm font-medium hover:bg-muted">
              <QrCode className="h-4 w-4" /> Share / QR
            </button>
            <span className="hidden md:inline-flex items-center gap-2 rounded-lg glass px-5 py-3 text-sm text-muted-foreground">
              <Smartphone className="h-4 w-4" /> Tap the AR icon on mobile
            </span>
          </div>

          <div className="mt-10 rounded-xl glass p-4 text-xs text-muted-foreground">
            Tip: on iPhone/Android, tap the AR icon in the viewer to launch native AR (Quick Look / Scene Viewer).
          </div>

          <Link to="/" className="mt-6 text-sm text-muted-foreground hover:text-foreground">← Back to store</Link>
        </div>
      </div>

      <QRModal open={qrOpen} onClose={() => setQrOpen(false)} url={url} />
    </div>
  );
}
