import { Client } from "pg";
const password = process.argv[2];
const regions = ["eu-north-1","ap-east-1","me-central-1","il-central-1","af-south-1","us-gov-west-1"];
async function probe(host) {
  const client = new Client({ host, port: 6543, user: "postgres.okoloionftfxyvscfvhh", password, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try { await client.connect(); const { rows } = await client.query("SELECT 1 AS one"); await client.end(); return "MATCH"; }
  catch (err) { const m = (err).message; return m.includes("not found") ? "wrong-region" : `POSSIBLE: ${m.slice(0,140)}`; }
}
for (const r of regions) { const h = `aws-0-${r}.pooler.supabase.com`; console.log(r.padEnd(16), "->", await probe(h)); }
