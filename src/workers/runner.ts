import { runWorker } from "./job-worker";
import { ensureBuckets } from "../lib/storage";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const STARTUP_DELAY_MS = 5_000; // 5 seconds grace period on boot
const MAX_CONSECUTIVE_FAILURES = 10; // consecutive failures before backing off
const BACKOFF_MULTIPLIER = 2; // double interval after max failures
const MAX_INTERVAL_MS = 300_000; // 5 minutes ceiling

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let consecutiveFailures = 0;
let currentInterval = POLL_INTERVAL_MS;
let running = false;
let shutdownRequested = false;
let cycleCount = 0;

// ---------------------------------------------------------------------------
// Single processing cycle
// ---------------------------------------------------------------------------
async function cycle(): Promise<boolean> {
  if (running) {
    console.log("[Runner] Previous cycle still running — skipping");
    return true;
  }

  running = true;
  const start = Date.now();

  try {
    await runWorker();
    consecutiveFailures = 0;
    currentInterval = POLL_INTERVAL_MS; // reset on success
    const elapsed = Date.now() - start;
    console.log(`[Runner] Cycle #${++cycleCount} completed in ${elapsed}ms`);
    return true;
  } catch (err) {
    consecutiveFailures++;
    const elapsed = Date.now() - start;
    console.error(
      `[Runner] Cycle #${++cycleCount} FAILED after ${elapsed}ms (consecutive failures: ${consecutiveFailures}):`,
      err instanceof Error ? err.message : err,
    );

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
      console.warn(`[Runner] Backing off — next interval: ${currentInterval / 1000}s`);
    }
    return false;
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("[Runner] AR Commerce Platform — Background Job Worker");
  console.log(`[Runner] PID: ${process.pid}`);
  console.log(`[Runner] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[Runner] Max consecutive failures: ${MAX_CONSECUTIVE_FAILURES}`);
  console.log("=".repeat(60));

  // 1. Ensure storage buckets exist
  try {
    console.log("[Runner] Ensuring storage buckets...");
    await ensureBuckets();
    console.log("[Runner] Storage buckets verified");
  } catch (err) {
    console.error(
      "[Runner] Failed to ensure buckets (non-fatal, continuing):",
      err instanceof Error ? err.message : err,
    );
  }

  // 2. Initial delay
  console.log(`[Runner] Starting in ${STARTUP_DELAY_MS / 1000}s...`);
  await sleep(STARTUP_DELAY_MS);

  // 3. Run first cycle immediately
  await cycle();

  // 4. Enter the polling loop
  while (!shutdownRequested) {
    await sleep(currentInterval);
    if (shutdownRequested) break;
    await cycle();
  }

  console.log("[Runner] Shutdown signal received — exiting");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Allow Node.js to exit naturally if the timer is the only thing keeping it alive
    if (timer.unref) timer.unref();
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function gracefulShutdown(signal: string) {
  console.log(`[Runner] Received ${signal} — shutting down gracefully...`);
  shutdownRequested = true;
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle unhandled rejections — log but don't crash the loop
process.on("unhandledRejection", (reason) => {
  console.error("[Runner] Unhandled rejection (non-fatal):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Runner] Uncaught exception (non-fatal):", err.message);
  // Don't exit — keep the loop alive
});

// ---------------------------------------------------------------------------
// Entry point detection
// ---------------------------------------------------------------------------
const isMainModule =
  process.argv[1]?.includes("runner") || process.argv[1]?.includes("job-worker");

if (isMainModule) {
  main().catch((err) => {
    console.error("[Runner] Fatal error:", err);
    process.exit(1);
  });
}

export { main };
