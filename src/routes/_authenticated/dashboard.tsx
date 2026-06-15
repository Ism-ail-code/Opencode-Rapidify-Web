import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { listMyProducts } from "@/lib/products.functions";
import { getMyAnalytics, getMyJobs } from "@/lib/analytics.functions";
import { getMyMerchant, claimDemoStore } from "@/lib/merchant.functions";
import { Boxes, Eye, Sparkles, ShoppingBag, Hourglass } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useEffect } from "react";

const analyticsOpts = queryOptions({ queryKey: ["my-analytics"], queryFn: () => getMyAnalytics() });
const productsOpts = queryOptions({ queryKey: ["my-products"], queryFn: () => listMyProducts() });
const jobsOpts = queryOptions({ queryKey: ["my-jobs"], queryFn: () => getMyJobs() });
const merchantOpts = queryOptions({ queryKey: ["my-merchant"], queryFn: () => getMyMerchant() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: analytics } = useSuspenseQuery(analyticsOpts);
  const { data: products } = useSuspenseQuery(productsOpts);
  const { data: jobs } = useSuspenseQuery(jobsOpts);
  const { data: merchant } = useSuspenseQuery(merchantOpts);

  useEffect(() => {
    if (!merchant) { void claimDemoStore().then(() => window.location.reload()); }
  }, [merchant]);

  const stats = [
    { label: "Active products", value: products.filter(p => p.status === "active").length, icon: Boxes },
    { label: "Product views", value: analytics.totals.product_view ?? 0, icon: Eye },
    { label: "AR launches", value: analytics.totals.ar_launch ?? 0, icon: Sparkles },
    { label: "Buy clicks", value: analytics.totals.buy_click ?? 0, icon: ShoppingBag },
  ];

  return (
    <DashboardShell title={`Welcome${merchant ? `, ${merchant.name}` : ""}`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl glass p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs uppercase tracking-wider">{s.label}</span>
              <s.icon className="h-4 w-4" />
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl glass p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Engagement — last 14 days</h3>
            <Link to="/analytics" className="text-xs text-muted-foreground hover:text-foreground">Full analytics →</Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={analytics.days}>
                <XAxis dataKey="day" stroke="currentColor" opacity={0.4} fontSize={11} />
                <YAxis stroke="currentColor" opacity={0.4} fontSize={11} />
                <Tooltip contentStyle={{ background: "rgba(20,15,35,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="views" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ar" stroke="#67e8f9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="buys" stroke="#f0abfc" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl glass p-5">
          <div className="mb-3 flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Processing queue</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {jobs.length === 0 && <li className="text-muted-foreground">No jobs yet.</li>}
            {jobs.slice(0, 6).map(j => (
              <li key={j.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <span className="truncate text-xs text-muted-foreground">{j.provider} · {new Date(j.created_at).toLocaleDateString()}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  j.status === "ready" ? "bg-emerald-500/20 text-emerald-300" :
                  j.status === "failed" ? "bg-red-500/20 text-red-300" :
                  "bg-amber-500/20 text-amber-300"
                }`}>{j.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-2xl glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Recent products</h3>
          <Link to="/products" className="text-xs text-muted-foreground hover:text-foreground">Manage all →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map(p => (
            <Link key={p.id} to="/products/$id" params={{ id: p.id }} className="overflow-hidden rounded-xl glass transition hover:translate-y-[-2px]">
              <div className="aspect-square bg-muted">
                {p.thumbnail_url && <img src={p.thumbnail_url} alt={p.title} className="h-full w-full object-cover" />}
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.status}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
