import { test } from "node:test";
import assert from "node:assert/strict";
import { themes, buildPlan, countPlan } from "../src/themes/index.js";
import { HUMOR_LEVELS, hasWelcomeVariants, rulesFor, welcomeFor } from "../src/themes/humor.js";
import { baseRules } from "../src/themes/base.js";

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

test("role keys and role names never collide between themes, so any mix is safe", () => {
  const keys = [];
  const names = [];
  for (const theme of themes) for (const role of theme.roles) {
    keys.push(role.key);
    names.push(role.name);
  }
  assert.equal(new Set(keys).size, keys.length, "a role key is used by two themes");
  assert.equal(new Set(names).size, names.length, "a role name is used by two themes");
});

test("roles anyone can pick for themselves never carry permissions", () => {
  for (const theme of themes) {
    for (const role of theme.roles) {
      if (role.pick) assert.equal(role.perms, undefined, `${theme.id}/${role.key} is self-assignable but has permissions`);
    }
  }
});

test("the booking theme keeps trust roles out of the self-assign picker and has its safety rules", () => {
  const booking = themes.find((t) => t.id === "booking");
  for (const key of ["bk-verified", "bk-top", "bk-regular"]) {
    assert.ok(!booking.roles.find((r) => r.key === key).pick, `${key} must be handed out by staff`);
  }
  const text = booking.extraRules.join(" ");
  assert.match(text, /18/);
  assert.match(text, /thông tin cá nhân/);
  const channels = booking.categories.flatMap((c) => c.channels.map((ch) => ch.name)).join(" ");
  for (const needle of ["bảng-giá", "chống-lừa-đảo", "feedback", "lịch-trống"]) assert.ok(channels.includes(needle), needle);
});

test("any mix of up to four themes stays inside Discord's limits", () => {
  const ids = themes.map((t) => t.id);
  let checked = 0;
  const walk = (start, picked) => {
    if (picked.length) {
      const counts = countPlan(buildPlan(picked));
      assert.ok(counts.roles <= 250 && counts.channels + counts.categories <= 500, picked.join("+"));
      checked++;
    }
    if (picked.length === 4) return;
    for (let i = start; i < ids.length; i++) walk(i + 1, [...picked, ids[i]]);
  };
  walk(0, []);
  assert.equal(checked, 11 + 55 + 165 + 330);
});

test("every humor level has the same number of shared rules and every built-in theme has a welcome for each level", () => {
  for (const level of HUMOR_LEVELS) assert.equal(rulesFor(level).length, baseRules.length, level);
  assert.equal(rulesFor("troll"), baseRules, "troll is the wording written in base.js");
  for (const theme of themes) {
    assert.ok(hasWelcomeVariants(theme.id), `${theme.id} lacks a gentle or absurd welcome`);
    for (const level of HUMOR_LEVELS) assert.ok(welcomeFor(theme, level).includes("{user}"), `${theme.id}/${level} welcome needs {user}`);
  }
});

test("the humor level changes the words but never the structure, so a rebuild at another level duplicates nothing", () => {
  const strip = (plan) => ({ roles: plan.roles, categories: plan.categories, extraStart: plan.rules.length });
  for (const ids of [["gaming"], ["booking", "anime"], ["hoc-tap", "dev-code", "thu-cung"]]) {
    const troll = buildPlan(ids);
    for (const level of ["nhe", "nham"]) {
      const other = buildPlan(ids, { humor: level });
      assert.deepEqual(strip(other), strip(troll), `${ids.join("+")}/${level}`);
      assert.notEqual(other.welcome, troll.welcome);
      assert.notDeepEqual(other.rules.slice(0, 8), troll.rules.slice(0, 8));
      assert.equal(other.humor, level);
    }
    assert.equal(troll.humor, "troll");
  }
});

test("an unknown humor level is refused and a theme without variants keeps its welcome", () => {
  assert.throws(() => buildPlan(["gaming"], { humor: "giận" }), /Unknown humor level/);
  assert.equal(welcomeFor({ id: "ai", welcome: "Chào {user}!" }, "nham"), "Chào {user}!");
});
