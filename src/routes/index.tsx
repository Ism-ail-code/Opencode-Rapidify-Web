import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { listFeaturedProducts } from "@/lib/products.functions";
import { ArrowRight, Boxes, BarChart3, Code2, QrCode, Sparkles, Zap } from "lucide-react";

const featuredOpts = queryOptions({
  queryKey: ["featured-products"],
  queryFn: () => listFeaturedProducts(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rapidify — AR Commerce SaaS for Modern Brands" },
      { name: "description", content: "Turn products into AR experiences. Upload a 3D model and ship a View-in-AR page, QR codes, and embeddable widgets in minutes." },
      { property: "og:title", content: "Rapidify — AR Commerce SaaS" },
      { property: "og:description", content: "AR product pages, QR sharing, and embeddable widgets for modern brands." },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  loader: ({ context }) => { context.queryClient.ensureQueryData(featuredOpts); },
  component: Landing,
});

function Landing() {
  const { data: featured } = useSuspenseQuery(featuredOpts);
  return (
    <div>
      <SiteHeader />
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" /> AR commerce, ready to ship
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
            Sell your products <span className="text-gradient">in augmented reality</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Upload a 3D model. Get a beautiful product page with View-in-AR on iOS &amp; Android, QR sharing, and an embeddable widget for your storefront — without writing a single line of native code.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth" className="rounded-lg btn-hero px-6 py-3 text-sm font-medium">
              Start free <ArrowRight className="ml-1 inline h-4 w-4" />
            </Link>
            <Link to="/p/$slug" params={{ slug: "astronaut" }} className="rounded-lg glass px-6 py-3 text-sm font-medium hover:bg-muted">
              Try the live demo
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Boxes, title: "GLB & USDZ", desc: "Drop in any model — we deliver native AR on iOS Quick Look and Android Scene Viewer." },
            { icon: QrCode, title: "QR & deep links", desc: "Auto-generated QR codes hand off shoppers from desktop to phone AR seamlessly." },
            { icon: Code2, title: "Embeddable widget", desc: "One-line snippet embeds an AR-ready product on any storefront — Shopify, WordPress, custom." },
            { icon: BarChart3, title: "AR analytics", desc: "Track product views, AR launches, variant switches and conversion in one dashboard." },
            { icon: Zap, title: "AI pipeline ready", desc: "Hook in Meshy, Tripo, or Stability to auto-generate 3D from photos. Plug-and-play providers." },
            { icon: Sparkles, title: "Multi-tenant SaaS", desc: "Isolated merchant accounts, role-aware admin, and infrastructure that scales with you." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl glass p-6 transition hover:translate-y-[-2px]">
              <span className="grid h-10 w-10 place-items-center rounded-lg btn-hero"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Live AR product pages</h2>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Build your own →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {featured.map((p) => (
            <Link key={p.id} to="/p/$slug" params={{ slug: p.slug }} className="group overflow-hidden rounded-2xl glass transition hover:translate-y-[-2px]">
              <div className="aspect-square overflow-hidden bg-muted">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : <div className="h-full w-full grid place-items-center text-muted-foreground"><Boxes className="h-8 w-8" /></div>}
              </div>
              <div className="p-4">
                <div className="text-xs text-muted-foreground">{p.merchants?.name ?? "Demo store"}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-sm text-muted-foreground">${(p.price_cents / 100).toFixed(0)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Pricing built for growth</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { name: "Starter", price: "Free", desc: "Up to 5 products. Perfect for launch.", cta: "Start free" },
            { name: "Growth", price: "$49/mo", desc: "Unlimited products. Embed widget. Analytics.", cta: "Start trial", featured: true },
            { name: "Enterprise", price: "Custom", desc: "SAML SSO, dedicated support, custom AI pipeline.", cta: "Contact sales" },
          ].map((t) => (
            <div key={t.name} className={`rounded-2xl glass p-6 ${t.featured ? "ring-1 ring-primary/50" : ""}`}>
              <div className="text-sm text-muted-foreground">{t.name}</div>
              <div className="mt-2 text-3xl font-semibold">{t.price}</div>
              <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              <Link to="/auth" className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-medium ${t.featured ? "btn-hero" : "glass hover:bg-muted"}`}>{t.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Rapidify — AR commerce platform
      </footer>
    </div>
  );
}
