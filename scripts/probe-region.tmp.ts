import { Client } from "pg";

const password = process.argv[2];
const regions = [
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "ap-south-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "sa-east-1", "ca-central-1",
];

async function probe(host: string): Promise<string> {
  const client = new Client({
    host,
    port: 6543,
    user: "postgres.okoloionftfxyvscfvhh",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT version() AS v");
    await client.end();
    return `MATCH: ${rows[0].v.slice(0, 40)}`;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("not found")) return "wrong-region";
    return `POSSIBLE: ${msg.slice(0, 120)}`;
  }
}

async function main() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const result = await probe(host);
    console.log(region.padEnd(16), "->", result);
    if (result.startsWith("MATCH")) break;
  }
}
main();
