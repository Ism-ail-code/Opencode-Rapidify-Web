import fs from "node:fs";
import path from "node:path";

/**
 * Loads .env from the project root as a FALLBACK for standalone scripts
 * (the worker, run-migrations, etc.). Never overrides env vars that are
 * already set in the shell, so production deployments keep working.
 */
export function loadEnvFile(envPath: string = path.resolve(process.cwd(), ".env")): void {
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/#.*$/, "").trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
