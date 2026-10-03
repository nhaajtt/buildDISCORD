import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { alert } from "./alerts.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "jobs");

// Every file in src/jobs exports default { name, everyMs, run(client) }. Each job runs once at start and then on its own timer,
// never overlapping itself, and an error in one job is logged and alerted without stopping the others.
export async function startJobs(client) {
  if (!existsSync(dir)) return [];
  const started = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const { default: job } = await import(pathToFileURL(path.join(dir, file)).href);
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run(client);
      } catch (error) {
        console.error(`Job ${job.name} failed:`, error);
        alert(`Job ${job.name} lỗi: ${error.message}`);
      } finally {
        running = false;
      }
    };
    setInterval(tick, job.everyMs).unref();
    tick();
    started.push(job.name);
  }
  return started;
}
