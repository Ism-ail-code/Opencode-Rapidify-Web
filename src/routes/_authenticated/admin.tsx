import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { getMyJobs } from "@/lib/analytics.functions";

const opts = queryOptions({ queryKey: ["my-jobs"], queryFn: () => getMyJobs() });

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { data: jobs } = useSuspenseQuery(opts);
  return (
    <DashboardShell title="Admin — Processing pipeline">
      <div className="overflow-hidden rounded-2xl glass">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Job</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th></tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} className="border-t border-border/50">
                <td className="px-4 py-3 font-mono text-xs">{j.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-muted-foreground">{j.provider}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    j.status === "ready" ? "bg-emerald-500/20 text-emerald-300" :
                    j.status === "failed" ? "bg-red-500/20 text-red-300" :
                    "bg-amber-500/20 text-amber-300"
                  }`}>{j.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No jobs.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Pipeline scaffold: queued → processing → optimizing → ready / failed. Providers (Meshy AI, Tripo AI, Stability AI) plug in here via webhook handlers.
      </p>
    </DashboardShell>
  );
}
