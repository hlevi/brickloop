export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./lib/config");
  if (!env.inlineWorker) return;
  const { startInlineWorker } = await import("./lib/jobs/worker");
  startInlineWorker(Number(process.env.WORKER_INTERVAL_MS || 2000));
}
