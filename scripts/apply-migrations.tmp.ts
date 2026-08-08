import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

const DB_URL = process.argv[2];
const MIGRATIONS_DIR = process.argv[3];
// Only these two files are pending on the live DB (the rest were applied
// manually via the dashboard SQL editor). They are idempotent.
const PENDING = [
  "20260808000000_fix_credit_rpcs.sql",
  "20260808000001_harden_webhook_events_rls.sql",
];

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  console.log("[migrate] connected to", new URL(DB_URL).host);

  // CLI-compatible migration tracking table
  await client.query("CREATE SCHEMA IF NOT EXISTS supabase_migrations");
  await client.query(`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY NOT NULL,
    statements text[],
    name text,
    created_at timestamptz DEFAULT now()
  )`);

  const { rows } = await client.query("SELECT version FROM supabase_migrations.schema_migrations");
  const tracked = new Set(rows.map((r) => r.version));
  console.log("[migrate] already tracked:", tracked.size);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;
  for (const file of files) {
    if (tracked.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8").trim();
    if (!sql) continue;
    if (PENDING.includes(file)) {
      console.log("[migrate] RUN", file);
      await client.query(sql);
      console.log("[migrate]   OK");
      ran++;
    } else {
      console.log("[migrate] SKIP (already applied manually)", file);
    }
    await client.query(
      "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
      [file, file],
    );
  }

  console.log(`[migrate] applied ${ran} pending migration(s)`);
  await client.end();
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err.message);
  process.exit(1);
});
