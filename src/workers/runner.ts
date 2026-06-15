// Worker runner script for background job processing
// This should be run periodically via cron, scheduled tasks, or a job queue service

import { runWorker } from "./job-worker";

async function main() {
  console.log("Starting AR Commerce Platform background job worker...");
  console.log(`Worker PID: ${process.pid}`);
  
  const startTime = Date.now();
  
  try {
    await runWorker();
    
    const duration = Date.now() - startTime;
    console.log(`Worker completed in ${duration}ms`);
  } catch (error) {
    console.error("Worker failed:", error);
    process.exit(1);
  }
}

const isMainModule = process.argv[1]?.includes("runner");
if (isMainModule) {
  main();
}

export { main };