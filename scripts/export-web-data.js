// Writes the data the website shows, straight from the bot's own theme files, so the page never drifts from what the bot really builds.
//   node scripts/export-web-data.js          write web/content/themes.data.json (and copy the devlog)
// The website merges themes with web/lib/compose.mjs, a port of composePlan. test/webdata.test.js fails if the committed data is out
// of date, and checks the port against the bot for every mix of up to four themes.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { themes } from "../src/themes/index.js";
import { baseRoles, baseRules, djCategory, infoCategory, staffCategory } from "../src/themes/base.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const category = (c) => ({
  name: c.name,
  staff: Boolean(c.staff),
  channels: c.channels.map((ch) => ({ name: ch.name, type: ch.type })),
});

export function buildWebData() {
  return {
    base: {
      roles: baseRoles.map((r) => r.name),
      rules: baseRules.length,
      info: category(infoCategory),
      dj: category(djCategory),
      staff: category(staffCategory),
    },
    themes: themes.map((t) => ({
      id: t.id,
      label: t.label,
      blurb: t.blurb,
      roles: t.roles.map((r) => r.name),
      extraRules: t.extraRules.length,
      categories: t.categories.map(category),
    })),
  };
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
