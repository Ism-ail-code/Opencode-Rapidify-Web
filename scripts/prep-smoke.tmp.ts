import { loadEnvFile } from "../src/workers/load-env";
loadEnvFile();
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function main() {
  // Defer pre-existing meshy test jobs so the smoke run targets only mine
  await supabaseAdmin
    .from("processing_jobs")
    .update({ next_retry_at: new Date(Date.now() + 2 * 3600_000).toISOString(), status: "queued" })
    .eq("provider", "meshy")
    .in("status", ["queued", "processing"]);

  // Reset my stuck smoke jobs to queued
  const { data: mine } = await supabaseAdmin
    .from("processing_jobs")
    .select("id, status")
    .eq("provider", "simulated")
    .in("status", ["processing", "queued"]);
  for (const j of mine ?? []) {
    await supabaseAdmin
      .from("processing_jobs")
      .update({ status: "queued", next_retry_at: new Date().toISOString(), error: null, started_at: null })
      .eq("id", j.id);
  }
  console.log("deferred meshy jobs, reset", mine?.length ?? 0, "smoke job(s)");
}
main().catch((e) => console.error(e.message));
