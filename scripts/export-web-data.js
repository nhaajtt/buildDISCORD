// Writes the data the website shows, straight from the bot's own code, so the page never drifts from what the bot really builds.
//   node scripts/export-web-data.js          write web/content/themes.data.json (and copy the devlog)
// test/webdata.test.js fails if the committed files are out of date.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPlan, countPlan, themes } from "../src/themes/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every non-empty combination of the built-in themes, in the order the themes are listed
export function buildWebData() {
  const ids = themes.map((t) => t.id);
  const plans = {};
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const picked = ids.filter((_, i) => mask & (1 << i));
    const plan = buildPlan(picked);
    plans[picked.join("+")] = {
      label: plan.label,
      counts: countPlan(plan),
      rules: plan.rules.length,
      roles: plan.roles.map((r) => r.name),
      categories: plan.categories.map((c) => ({
        name: c.name,
        staff: Boolean(c.staff),
        channels: c.channels.map((ch) => ({ name: ch.name, type: ch.type })),
      })),
    };
  }
  return { themes: themes.map((t) => ({ id: t.id, label: t.label, blurb: t.blurb })), plans };
}

export const files = {
  data: path.join(root, "web", "content", "themes.data.json"),
  devlogSource: path.join(root, "docs", "devlog.md"),
  devlogCopy: path.join(root, "web", "content", "devlog.md"),
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(files.data, `${JSON.stringify(buildWebData(), null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, files.data)}`);
  if (existsSync(files.devlogSource)) {
    copyFileSync(files.devlogSource, files.devlogCopy);
    console.log(`Copied ${path.relative(root, files.devlogSource)} to ${path.relative(root, files.devlogCopy)}`);
  }
}

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
