import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file manually
const envPath = path.resolve(__dirname, "..", ".env");
const envVars: Record<string, string> = {};
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const k = trimmed.slice(0, idx).trim();
  const v = trimmed.slice(idx + 1).trim().replace(/#.*$/, "").trim();
  if (k && v) envVars[k] = v;
}

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "supabase", "migrations");
const SUPABASE_URL = envVars.SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
let passed = 0, failed = 0;

async function main() {
  if (!SUPABASE_URL || !KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  console.log(`Found ${files.length} migration files\n`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8").trim();
    if (!sql) { console.log(`  SKIP  ${file}`); continue; }
    process.stdout.write(`  RUN   ${file} ... `);
    try {
      // Try multiple endpoint paths
      const paths = ["/sql", "/rest/v1/sql", "/api/sql"];
      let ok = false;
      let lastErr = "";
      for (const p of paths) {
        const res = await fetch(`${SUPABASE_URL}${p}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
          body: JSON.stringify({ query: sql }),
        });
        const text = await res.text();
        if (res.ok || text.includes("already exists") || text.includes("duplicate key")) {
          ok = true;
          break;
        }
        lastErr = text;
      }
      if (ok) { console.log("OK"); passed++; }
      else { console.log("FAILED"); console.error(`    ${lastErr.slice(0, 500)}`); failed++; }
    } catch (err) { console.log("ERROR"); console.error(`    ${err}`); failed++; }
  }
  console.log(`\nDone — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main().catch(err => { console.error("Fatal:", err); process.exit(1); });
