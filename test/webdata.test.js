import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildWebData, files, readJson } from "../scripts/export-web-data.js";
import { buildPlan, countPlan, themes } from "../src/themes/index.js";
import { compose } from "../web/lib/compose.mjs";

test("the website's theme data matches the bot's theme files (run: node scripts/export-web-data.js)", () => {
  assert.deepEqual(readJson(files.data), buildWebData());
});

// The shape the website shows, taken from the bot's own plan
const project = (plan) => ({
  label: plan.label,
  roles: plan.roles.map((r) => r.name),
  rules: plan.rules.length,
  categories: plan.categories.map((c) => ({ name: c.name, staff: Boolean(c.staff), channels: c.channels.map((ch) => ({ name: ch.name, type: ch.type })) })),
  counts: countPlan(plan),
});

test("the website's port of composePlan equals the bot for every mix of up to four themes", () => {
  const data = buildWebData();
  const ids = themes.map((t) => t.id);
  let checked = 0;
  const walk = (start, picked) => {
    if (picked.length) {
      assert.deepEqual(compose(data, picked), project(buildPlan(picked)), picked.join("+"));
      checked++;
    }
    if (picked.length === 4) return;
    for (let i = start; i < ids.length; i++) walk(i + 1, [...picked, ids[i]]);
  };
  walk(0, []);
  assert.equal(checked, 11 + 55 + 165 + 330);
});

test("the port refuses an unknown theme like the bot does", () => {
  assert.throws(() => compose(buildWebData(), ["nope"]), /Unknown theme/);
});

test("the website's copy of the devlog is up to date", { skip: !existsSync(files.devlogSource) }, () => {
  assert.equal(readFileSync(files.devlogCopy, "utf8"), readFileSync(files.devlogSource, "utf8"));
});
