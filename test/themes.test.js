import { test } from "node:test";
import assert from "node:assert/strict";
import { themes, buildPlan, countPlan } from "../src/themes/index.js";

test("every theme fits Discord limits and has unique names", () => {
  for (const theme of themes) {
    const plan = buildPlan(theme.id);
    const counts = countPlan(plan);
    assert.ok(counts.roles <= 250 && counts.channels + counts.categories <= 500, theme.id);

    const roleKeys = plan.roles.map((r) => r.key);
    assert.equal(new Set(roleKeys).size, roleKeys.length, `${theme.id}: duplicate role key`);
    for (const key of ["boss", "mod"]) assert.ok(roleKeys.includes(key));

    const categoryNames = plan.categories.map((c) => c.name);
    assert.equal(new Set(categoryNames).size, categoryNames.length, `${theme.id}: duplicate category`);

    for (const category of plan.categories) {
      assert.ok(category.name.length <= 100);
      const names = category.channels.map((c) => c.name);
      assert.equal(new Set(names).size, names.length, `${theme.id}/${category.name}: duplicate channel`);
      for (const channel of category.channels) {
        assert.ok(channel.name.length <= 100);
        assert.ok(["text", "voice"].includes(channel.type));
        if (channel.topic) assert.ok(channel.topic.length <= 1024);
      }
    }
    for (const role of plan.roles) assert.ok(role.name.length <= 100);
  }
});

test("each theme has a rules, welcome, roles, dj and tts channel", () => {
  for (const theme of themes) {
    const kinds = buildPlan(theme.id).categories.flatMap((c) => c.channels.map((ch) => ch.kind)).filter(Boolean);
    for (const kind of ["rules", "welcome", "roles", "dj", "tts"]) assert.ok(kinds.includes(kind), `${theme.id} lacks ${kind}`);
  }
});

test("unknown theme throws", () => {
  assert.throws(() => buildPlan("nope"));
});

test("mixed themes merge without duplicate channels or categories", () => {
  const plan = buildPlan("gaming+hoc-tap+chill-ban-be");
  const names = plan.categories.flatMap((c) => c.channels.map((ch) => ch.name));
  assert.equal(new Set(names).size, names.length);
  const cats = plan.categories.map((c) => c.name);
  assert.equal(new Set(cats).size, cats.length);
  const keys = plan.roles.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
  const counts = countPlan(plan);
  assert.ok(counts.roles <= 250 && counts.channels + counts.categories <= 500);
  assert.ok(plan.categories.some((c) => c.name.includes("Khu Cày Game")));
  assert.ok(plan.categories.some((c) => c.name.includes("Khu Học Tập")));
  assert.ok(plan.categories.some((c) => c.name.includes("Nhà Chung")));
  assert.equal(buildPlan(["gaming", "gaming"]).id, "gaming");
});
