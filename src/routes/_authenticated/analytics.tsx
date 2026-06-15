import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { getMyAnalytics, getConversionFunnel, getPerProductAnalytics, getRealTimeAnalytics, getAnalyticsSummary } from "@/lib/analytics.functions";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, Users, Eye, Sparkles, ShoppingBag, Activity } from "lucide-react";

const overviewOpts = queryOptions({ queryKey: ["my-analytics"], queryFn: () => getMyAnalytics() });
const funnelOpts = queryOptions({ queryKey: ["analytics-funnel"], queryFn: () => getConversionFunnel() });
const productsAnalyticsOpts = queryOptions({ queryKey: ["analytics-products"], queryFn: () => getPerProductAnalytics({ data: { days: 30 } }) });
const realtimeOpts = queryOptions({ queryKey: ["analytics-realtime"], queryFn: () => getRealTimeAnalytics() });
const summaryOpts = queryOptions({ queryKey: ["analytics-summary"], queryFn: () => getAnalyticsSummary() });

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: overview } = useSuspenseQuery(overviewOpts);
  const { data: funnel } = useSuspenseQuery(funnelOpts);
  const { data: productAnalytics } = useSuspenseQuery(productsAnalyticsOpts);
  const { data: realtime } = useSuspenseQuery(realtimeOpts);
  const { data: summary } = useSuspenseQuery(summaryOpts);
  const [tab, setTab] = useState<"overview" | "funnel" | "products" | "realtime">("overview");

  return (
    <DashboardShell title="Analytics">
      <div className="mb-6 flex gap-2 border-b border-border pb-2">
        {(["overview", "funnel", "products", "realtime"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${tab === t ? "btn-hero" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "overview" ? "Overview" : t === "funnel" ? "Funnel" : t === "products" ? "Products" : "Real-time"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Events</div>
              <div className="mt-2 text-3xl font-semibold">{summary?.totalEvents ?? 0}</div>
              <div className="mt-1 text-xs text-muted-foreground">Last 30 days</div>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Last 7 days</div>
              <div className="mt-2 text-3xl font-semibold">{summary?.last7Days ?? 0}</div>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Last 24h</div>
              <div className="mt-2 text-3xl font-semibold">{summary?.last24Hours ?? 0}</div>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Conversion Rate</div>
              <div className="mt-2 text-3xl font-semibold">{funnel?.conversionRate ?? "0%"}</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl glass p-5">
            <h3 className="mb-3 text-sm font-medium">Engagement — last 14 days</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={overview.days}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" stroke="currentColor" opacity={0.4} fontSize={11} />
                  <YAxis stroke="currentColor" opacity={0.4} fontSize={11} />
                  <Tooltip contentStyle={{ background: "rgba(20,15,35,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Bar dataKey="views" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ar" fill="#67e8f9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="buys" fill="#f0abfc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 rounded-2xl glass p-5">
            <h3 className="mb-3 text-sm font-medium">Events by type</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(summary?.byType ?? {}).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
                  <span className="text-sm capitalize text-muted-foreground">{type.replace(/_/g, " ")}</span>
                  <span className="text-lg font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl glass p-5">
            <h3 className="mb-3 text-sm font-medium">Recent events</h3>
            <ul className="divide-y divide-border/40 text-sm">
              {overview.recent.map((e, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span>{e.event_type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </li>
              ))}
              {overview.recent.length === 0 && <li className="py-6 text-center text-muted-foreground">No events yet.</li>}
            </ul>
          </div>
        </>
      )}

      {tab === "funnel" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl glass p-5 lg:col-span-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Conversion Funnel</div>
              <div className="mt-4 space-y-3">
                {Object.entries(funnel?.funnel ?? {}).map(([stage, count]) => {
                  const maxCount = Math.max(...Object.values(funnel?.funnel ?? {}));
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={stage} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-muted-foreground">{stage.replace(/_/g, " ")}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Events</div>
              <div className="mt-2 text-3xl font-semibold">{funnel?.totalEvents ?? 0}</div>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Conversion Rate</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-400">{funnel?.conversionRate ?? "0%"}</div>
              <div className="mt-1 text-xs text-muted-foreground">View → Buy</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl glass p-5">
            <h3 className="mb-3 text-sm font-medium">How to improve</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
                <span>If AR launch rate is low, make sure your models load quickly on mobile</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                <span>If buy click rate is low, try adding more compelling CTAs near the AR viewer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-pink-400 shrink-0" />
                <span>QR scan data helps optimize mobile-to-desktop handoff</span>
              </li>
            </ul>
          </div>
        </>
      )}

      {tab === "products" && (
        <div className="overflow-hidden rounded-2xl glass">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">AR Launches</th>
                <th className="px-4 py-3">Buy Clicks</th>
                <th className="px-4 py-3">Sessions</th>
                <th className="px-4 py-3">Conv. Rate</th>
              </tr>
            </thead>
            <tbody>
              {productAnalytics.map(p => (
                <tr key={p.productId} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link to="/products/$id" params={{ id: p.productId }} className="font-medium hover:underline">{p.title}</Link>
                  </td>
                  <td className="px-4 py-3">{p.views}</td>
                  <td className="px-4 py-3">{p.arLaunches}</td>
                  <td className="px-4 py-3">{p.buyClicks}</td>
                  <td className="px-4 py-3">{p.uniqueSessions}</td>
                  <td className="px-4 py-3">{p.conversionRate}%</td>
                </tr>
              ))}
              {productAnalytics.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No product data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "realtime" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl glass p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Activity className="h-3 w-3" /> Active Now
              </div>
              <div className="mt-2 text-3xl font-semibold text-emerald-400">{realtime?.activeSessions ?? 0}</div>
              <div className="mt-1 text-xs text-muted-foreground">Sessions in last 15 min</div>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Recent Events</div>
              <div className="mt-2 text-3xl font-semibold">{realtime?.totalRecent ?? 0}</div>
            </div>
          </div>

          {realtime && realtime.events && Object.keys(realtime.events).length > 0 && (
            <div className="mt-6 rounded-2xl glass p-5">
              <h3 className="mb-3 text-sm font-medium">Events (last 15 min)</h3>
              <div className="grid gap-2">
                {Object.entries(realtime.events).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2">
                    <span className="text-sm capitalize text-muted-foreground">{type.replace(/_/g, " ")}</span>
                    <span className="text-lg font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl glass p-5">
            <h3 className="mb-3 text-sm font-medium">Quick actions</h3>
            <div className="flex gap-2">
              <Link to="/products" className="rounded-lg glass px-4 py-2 text-sm hover:bg-muted">
                View all products
              </Link>
              <Link to="/admin" className="rounded-lg glass px-4 py-2 text-sm hover:bg-muted">
                Processing jobs
              </Link>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}