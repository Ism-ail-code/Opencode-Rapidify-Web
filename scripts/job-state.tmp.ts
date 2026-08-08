import { loadEnvFile } from "../src/workers/load-env";
loadEnvFile();
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function main() {
  const { data: jobs, error } = await supabaseAdmin
    .from("processing_jobs")
    .select("id, provider, status, retries, error, input, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  for (const j of jobs ?? []) {
    console.log(j.created_at.slice(0, 19), j.provider.padEnd(10), j.status.padEnd(11), "retries:", j.retries, "|", (j.error ?? "").slice(0, 60), "| input:", JSON.stringify(j.input ?? {}).slice(0, 90));
  }
}
main().catch((e) => console.error(e.message));
