// Asks the AI designer for one real answer per humor level and saves them for the website's demo.
//   node scripts/sample-designs.js     (needs GEMINI_API_KEY in .env)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveModel } from "../src/ai/gemini.js";
import { designServer } from "../src/ai/designer.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const description = "Nhóm 8 người bạn đại học, hay chơi Valorant tối thứ Bảy và tám chuyện";

// The free tier has a small per-minute quota, so a quota answer is waited out instead of failing the run
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function withPatience(task) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (error.kind !== "quota" || attempt >= 4) throw error;
      console.log(`quota reached, waiting 65 seconds (attempt ${attempt})`);
      await sleep(65_000);
    }
  }
}

const model = await resolveModel();
const samples = {};
for (const level of ["nhe", "troll", "nham"]) {
  const theme = await withPatience(() => designServer({ description, humor: level }));
  samples[level] = {
    label: theme.label,
    welcome: theme.welcome,
    roles: theme.roles.map((r) => r.name),
    rules: theme.extraRules,
    categories: theme.categories.map((c) => ({ name: c.name, channels: c.channels.map((ch) => ({ name: ch.name, type: ch.type })) })),
  };
  console.log(`${level}: ${theme.label} (${theme.categories.length} categories)`);
  await sleep(15_000);
}

const out = path.join(root, "web", "content", "ai-samples.json");
writeFileSync(out, `${JSON.stringify({ description, model, generatedAt: new Date().toISOString().slice(0, 10), samples }, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, out)} using ${model}`);
