import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildWebData, files, readJson } from "../scripts/export-web-data.js";

test("the website's theme data matches what the bot builds (run: node scripts/export-web-data.js)", () => {
  assert.deepEqual(readJson(files.data), buildWebData());
});

test("every combination is present and inside Discord's limits", () => {
  const { plans, themes } = buildWebData();
  assert.equal(Object.keys(plans).length, 2 ** themes.length - 1);
  for (const [key, plan] of Object.entries(plans)) {
    assert.ok(plan.counts.roles <= 250, key);
    assert.ok(plan.counts.channels + plan.counts.categories <= 500, key);
    const names = plan.categories.flatMap((c) => c.channels.map((ch) => ch.name));
    assert.equal(new Set(names).size, names.length, `${key} has a repeated channel`);
  }
});

test("the website's copy of the devlog is up to date", { skip: !existsSync(files.devlogSource) }, () => {
  assert.equal(readFileSync(files.devlogCopy, "utf8"), readFileSync(files.devlogSource, "utf8"));
});
