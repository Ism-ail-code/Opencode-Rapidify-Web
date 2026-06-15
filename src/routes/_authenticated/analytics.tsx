import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { getMyAnalytics } from "@/lib/analytics.functions";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const opts = queryOptions({ queryKey: ["my-analytics"], queryFn: () => getMyAnalytics() });

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data } = useSuspenseQuery(opts);
  return (
    <DashboardShell title="Analytics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(data.totals).map(([k, v]) => (
          <div key={k} className="rounded-2xl glass p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}</div>
            <div className="mt-2 text-3xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl glass p-5">
        <h3 className="mb-3 text-sm font-medium">Engagement — last 14 days</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={data.days}>
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
        <h3 className="mb-3 text-sm font-medium">Recent events</h3>
        <ul className="divide-y divide-border/40 text-sm">
          {data.recent.map((e, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span>{e.event_type.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
          {data.recent.length === 0 && <li className="py-6 text-center text-muted-foreground">No events yet.</li>}
        </ul>
      </div>
    </DashboardShell>
  );
}
