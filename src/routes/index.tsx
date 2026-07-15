import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowRight, Boxes, BarChart3, Code2, QrCode, Sparkles, Zap, Check } from "lucide-react";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
  component: Landing,
});

function Landing() {
  const isMobile = useIsMobile();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const pricingTiers = [
    {
      name: "Starter",
      monthlyPrice: "Free",
      annualPrice: "Free",
      desc: "Perfect for testing the waters. All core AR features included.",
      cta: "Start free",
      features: [
        "Up to 5 products",
        "GLB & USDZ support",
        "Public AR product pages",
        "QR code generation",
        "Embeddable widget",
        "Basic analytics dashboard",
        "Community support",
      ],
    },
    {
      name: "Growth",
      monthlyPrice: "$49",
      annualPrice: "$39",
      desc: "For growing brands that need full-scale AR commerce.",
      cta: "Start trial",
      featured: true,
      features: [
        "Unlimited products & variants",
        "AI 2D-to-3D generation (Meshy/Tripo)",
        "Full analytics suite with conversion funnel",
        "Marketplace integrations (Daraz, Amazon, Shopify)",
        "Multi-angle photo upload for AI pipeline",
        "Priority processing queue",
        "Email & chat support",
      ],
    },
    {
      name: "Enterprise",
      monthlyPrice: "Custom",
      annualPrice: "Custom",
      desc: "Tailored infrastructure for high-volume merchants and platforms.",
      cta: "Contact sales",
      features: [
        "Everything in Growth, plus:",
        "SAML SSO & team role management",
        "Custom AI pipeline & model training",
        "Dedicated worker instances",
        "Custom embed & white-label options",
        "99.9% uptime SLA",
        "Dedicated account manager & onboarding",
      ],
    },
  ];

  const faqs = [
    {
      q: "What 3D file formats does Rapidify support?",
      a: "Rapidify supports GLB and USDZ formats. GLB works on Android via Scene Viewer, and USDZ works on iOS via Quick Look. You can upload either or both — we'll deliver the right format to each device automatically.",
    },
    {
      q: "Do I need coding experience to use Rapidify?",
      a: "No coding required. Simply upload your 3D model, and Rapidify generates a beautiful product page with AR viewing, QR codes, and an embeddable widget. You can copy a one-line snippet to embed on any storefront.",
    },
    {
      q: "How does the AR experience work on mobile?",
      a: "When a shopper scans the QR code or taps the link on their phone, the AR experience opens natively — Apple Quick Look on iOS and Scene Viewer on Android. No app install needed.",
    },
    {
      q: "Can I embed Rapidify on my existing website?",
      a: "Yes! Rapidify provides a one-line embed snippet that works with Shopify, WordPress, WooCommerce, Squarespace, or any custom website. The widget is fully responsive and AR-ready.",
    },
    {
      q: "What analytics are available?",
      a: "The Growth and Enterprise plans include full analytics: product views, AR launch counts, variant switches, time spent in AR, and conversion tracking — all in one dashboard.",
    },
    {
      q: "Can I try before I buy?",
      a: "Absolutely. The Starter plan is free forever with up to 5 products. The Growth plan also comes with a 14-day free trial, no credit card required.",
    },
  ];

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
            <Link to="/auth" search={{ verify: undefined }} className="rounded-lg btn-hero px-6 py-3 text-sm font-medium">
              Start free <ArrowRight className="ml-1 inline h-4 w-4" />
            </Link>
            {isMobile && (
              <Link to="/p/$slug" params={{ slug: "astronaut" }} className="rounded-lg glass px-6 py-3 text-sm font-medium hover:bg-muted">
                Try the live demo
              </Link>
            )}
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

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Pricing built for growth</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-muted-foreground">
          Start free, scale as you grow. No hidden fees, no surprise charges.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${billingCycle === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("annual")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${billingCycle === "annual" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            Annual <span className="ml-1 text-xs opacity-70">Save 20%</span>
          </button>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {pricingTiers.map((t) => (
            <div key={t.name} className={`flex flex-col rounded-2xl glass p-6 ${t.featured ? "ring-2 ring-foreground/30 scale-[1.02]" : ""}`}>
              {t.featured && <div className="-mt-9 mb-4 text-center text-xs font-medium uppercase tracking-wider text-foreground">Most popular</div>}
              <div className="text-sm text-muted-foreground">{t.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold">{billingCycle === "monthly" ? t.monthlyPrice : t.annualPrice}</span>
                {t.monthlyPrice !== "Free" && t.monthlyPrice !== "Custom" && <span className="text-sm text-muted-foreground">per month</span>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {t.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link to="/auth" search={{ verify: undefined }} className={`block rounded-lg py-2.5 text-center text-sm font-medium ${t.featured ? "btn-hero" : "glass hover:bg-muted"}`}>{t.cta}</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Rapidify — AR commerce platform
      </footer>
    </div>
  );
}
