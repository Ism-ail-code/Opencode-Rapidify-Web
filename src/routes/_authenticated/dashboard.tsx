import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { getDashboardSnapshot } from "@/lib/dashboard.functions";
import { generateDemoWorkspace, resetDemoData, simulateShopifyWebhook } from "@/lib/developer-tools.functions";
import { AlertTriangle, BarChart3, Boxes, CheckCircle2, CircleDashed, Eye, Package, RefreshCw, ShieldAlert, ShieldCheck, ShoppingCart, Sparkles, Wrench } from "lucide-react";

const dashboardOptions = queryOptions({ queryKey: ["dashboard-snapshot"], queryFn: () => getDashboardSnapshot() });
const developerToolsVisible = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEVELOPER_TOOLS === "true";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();
  const dashboard = useQuery(dashboardOptions);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot"] });
  const demo = useMutation({ mutationFn: () => generateDemoWorkspace(), onSuccess: refresh });
  const webhook = useMutation({ mutationFn: () => simulateShopifyWebhook(), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => resetDemoData(), onSuccess: refresh });

  if (dashboard.isLoading) {
    return <DashboardShell title="Merchant dashboard"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl glass" />)}</div></DashboardShell>;
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <DashboardShell title="Merchant dashboard">
        <div className="rounded-2xl glass p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
          <h2 className="text-lg font-semibold">Dashboard data is temporarily unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your data is safe. Try refreshing the dashboard.</p>
          <button type="button" onClick={() => dashboard.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"><RefreshCw className="h-4 w-4" /> Try again</button>
        </div>
      </DashboardShell>
    );
  }

  const data = dashboard.data;
  const completed = Boolean(data.profile?.onboarding_completed_at);
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const cards = [
    { label: "Total Views", value: data.metrics.totalViews.toLocaleString(), icon: Eye },
    { label: "AR Launches", value: data.metrics.arLaunches.toLocaleString(), icon: Sparkles },
    { label: "Add to Cart", value: data.metrics.addToCartAfterAr.toLocaleString(), icon: ShoppingCart },
    { label: "Revenue Influenced", value: currency.format(data.metrics.revenueInfluenced / 100), icon: BarChart3 },
  ];

  return (
    <DashboardShell title={data.merchant?.name ? `Welcome, ${data.merchant.name}` : "Merchant dashboard"}>
      {!completed && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">Complete your merchant profile</p><p className="mt-1 text-sm text-muted-foreground">Finish onboarding to keep store and marketplace details current.</p></div>
          <Link to="/auth/onboarding" search={{ verify: undefined }} className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">Complete Merchant Profile</Link>
        </div>
      )}

      {data.warnings.length > 0 && <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{data.warnings.join(" ")}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl glass p-5"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs uppercase tracking-wider">{label}</span><Icon className="h-4 w-4" /></div><div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div></div>)}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full ${data.profile?.is_verified ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{data.profile?.is_verified ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}</span><h2 className="text-sm font-medium">Business verification</h2></div>
          <p className="mt-3 text-sm">{data.profile?.is_verified ? "Verified" : "Verification pending"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.profile?.business_name || "Business details not completed"}</p>
        </section>
        <section className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2"><CircleDashed className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-medium">Sync status</h2></div>
          <p className="mt-3 text-sm capitalize">{data.sync.status.replace(/-/g, " ")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.sync.queued} active job{data.sync.queued === 1 ? "" : "s"}{data.sync.failed ? ` · ${data.sync.failed} needs attention` : ""}</p>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl glass p-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-medium">Recent activity</h2><Link to="/analytics" className="text-xs text-muted-foreground hover:text-foreground">View analytics →</Link></div>
          <ul className="mt-3 divide-y divide-border/50 text-sm">
            {data.activity.map((event, index) => <li key={`${event.created_at}-${index}`} className="flex items-center justify-between py-3"><span className="capitalize">{event.type.replace(/_/g, " ")}</span><time className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</time></li>)}
            {data.activity.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No activity yet. Add a product or use the developer utility to generate test data.</li>}
          </ul>
        </section>
        <section className="rounded-2xl glass p-5">
          <h2 className="text-sm font-medium">Empty-state checklist</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">{completed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <CircleDashed className="h-4 w-4" />} Complete merchant profile</li>
            <li className="flex gap-2">{data.products.length ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <CircleDashed className="h-4 w-4" />} Add or sync products</li>
            <li className="flex gap-2">{data.products.some((product) => product.ar_ready) ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <CircleDashed className="h-4 w-4" />} Upload an AR-ready model</li>
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-2xl glass p-5">
        <div className="flex items-center justify-between"><h2 className="text-sm font-medium">Products</h2><Link to="/products" className="text-xs text-muted-foreground hover:text-foreground">Manage products →</Link></div>
        {data.products.length === 0 ? <div className="py-8 text-center"><Package className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm">No products yet</p><Link to="/products/new" className="mt-4 inline-block text-sm text-violet-300 hover:underline">Add your first product</Link></div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.products.slice(0, 4).map((product) => <Link key={product.id} to="/products/$id" params={{ id: product.id }} className="overflow-hidden rounded-xl bg-muted/30 transition hover:bg-muted/50"><img src={product.image_url} alt="" className="h-28 w-full object-cover" onError={(event) => { event.currentTarget.src = "/placeholder.png"; }} /><div className="p-3"><p className="truncate text-sm font-medium">{product.title}</p><p className="mt-1 text-xs text-muted-foreground">{product.sku} · {product.ar_ready ? "AR ready" : "Model pending"}</p></div></Link>)}</div>}
      </section>

      <section className="mt-6 rounded-2xl glass p-5">
        <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Engagement rate</p><p className="mt-1 text-2xl font-semibold">{data.metrics.engagementRate.toFixed(1)}%</p></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Conversion after AR</p><p className="mt-1 text-2xl font-semibold">{data.metrics.conversionAfterAr.toFixed(1)}%</p></div></div>
      </section>

      {developerToolsVisible && <section className="mt-6 rounded-2xl border border-dashed border-border p-5"><div className="flex items-center gap-2"><Wrench className="h-4 w-4" /><h2 className="text-sm font-medium">Developer utilities</h2></div><p className="mt-1 text-xs text-muted-foreground">Enabled only in development or when VITE_ENABLE_DEVELOPER_TOOLS is set.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={demo.isPending} onClick={() => demo.mutate()} className="rounded-lg bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50">Generate 5–10 demo products</button><button type="button" disabled={webhook.isPending} onClick={() => webhook.mutate()} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">Simulate Shopify webhook</button><button type="button" disabled={reset.isPending} onClick={() => reset.mutate()} className="rounded-lg border border-red-400/50 px-3 py-2 text-sm text-red-300 disabled:opacity-50">Reset my demo data</button></div>{(demo.isError || webhook.isError || reset.isError) && <p className="mt-3 text-sm text-red-300">{(demo.error ?? webhook.error ?? reset.error)?.message ?? "A developer utility failed. Verify database migrations and ENABLE_DEVELOPER_TOOLS."}</p>}</section>}
    </DashboardShell>
  );
}
