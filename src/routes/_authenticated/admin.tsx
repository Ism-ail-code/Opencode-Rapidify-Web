import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/DashboardShell";
import { getProcessingJobs, processJob } from "@/lib/jobs.functions";
import { toast } from "sonner";

const opts = queryOptions({ queryKey: ["processing-jobs"], queryFn: () => getProcessingJobs() });

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Rapidify" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { data: jobs } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready": return "bg-emerald-500/20 text-emerald-300";
      case "failed": return "bg-red-500/20 text-red-300";
      case "processing": return "bg-blue-500/20 text-blue-300";
      case "optimizing": return "bg-purple-500/20 text-purple-300";
      default: return "bg-amber-500/20 text-amber-300";
    }
  };
  
  const handleStartJob = async (jobId: string) => {
    try {
      await processJob({ data: { job_id: jobId, action: "start" } });
      toast.success("Job started");
      await qc.invalidateQueries({ queryKey: ["processing-jobs"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start job");
    }
  };
  
  const handleRetryJob = async (jobId: string) => {
    try {
      await processJob({ data: { job_id: jobId, action: "retry" } });
      toast.success("Job retried");
      await qc.invalidateQueries({ queryKey: ["processing-jobs"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to retry job");
    }
  };
  
  const handleFailJob = async (jobId: string) => {
    try {
      await processJob({ data: { job_id: jobId, action: "fail", error_message: "Manual failure" } });
      toast.success("Job marked as failed");
      await qc.invalidateQueries({ queryKey: ["processing-jobs"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark job as failed");
    }
  };
  
  return (
    <DashboardShell title="Admin — Processing pipeline">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{jobs.length} total jobs</p>
        <div className="flex gap-2">
          <button 
            onClick={() => qc.invalidateQueries({ queryKey: ["processing-jobs"] })}
            className="rounded-lg glass px-3 py-1 text-xs hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>
      
      <div className="overflow-hidden rounded-2xl glass">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Retries</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} className="border-t border-border/50">
                <td className="px-4 py-3 font-mono text-xs">{j.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-muted-foreground">{j.provider}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(j.status)}`}>{j.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{j.retries || 0}/{j.max_retries || 5}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {j.status === "queued" && (
                      <button 
                        onClick={() => handleStartJob(j.id)}
                        className="rounded px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                      >
                        Start
                      </button>
                    )}
                    {j.status === "failed" && j.retries < (j.max_retries || 5) && (
                      <button 
                        onClick={() => handleRetryJob(j.id)}
                        className="rounded px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                      >
                        Retry
                      </button>
                    )}
                    {j.status !== "failed" && j.status !== "ready" && (
                      <button 
                        onClick={() => handleFailJob(j.id)}
                        className="rounded px-2 py-0.5 text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30"
                      >
                        Fail
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No jobs.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Enhanced job system: queued → processing → optimizing → ready / failed. Jobs have retry logic with exponential backoff. Manual control available.
      </p>
    </DashboardShell>
  );
}
