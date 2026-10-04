import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "stats-test-"));

const stats = await import("../src/jobs/stats.js");
const job = stats.default;
const { getSection, setSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");

const { statValue, renderStat, updateGuildStats, runStats, RENAME_GAP_MS, canRename, missingToRename } = stats;

let n = 0;
const sf = () => `95${String(++n).padStart(16, "0")}`;
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);
const MIN = 60_000;

function world({ pro = false, manage = true, memberCount = 100, boosts = 3 } = {}) {
  const guildId = sf();
  if (pro) grant(guildId, "pro", 30, T0);
  const channels = new Map();
  const calls = [];
  const guild = {
    id: guildId,
    available: true,
    memberCount,
    premiumSubscriptionCount: boosts,
    roles: { cache: new Map([[guildId, {}], ["r1", {}], ["r2", {}]]) },
    members: { me: { id: "bot" } },
    channels: { cache: channels, fetch: async (id) => channels.get(id) ?? Promise.reject(Object.assign(new Error("Unknown Channel"), { code: 10003 })) },
  };
  const add = (name) => {
    const c = {
      id: sf(),
      name,
      isVoiceBased: () => true,
      permissionsFor: () => ({ has: (f) => (manage ? true : f === "ViewChannel") }),
      setName: async (value) => {
        calls.push({ id: c.id, value });
        c.name = value;
      },
    };
    channels.set(c.id, c);
    return c;
  };
  return { guild, add, calls, channels, client: { guilds: { cache: new Map([[guildId, guild]]) } } };
}

const list = (w, entries, enabled = true) => setSection(w.guild.id, "stats", { enabled, channels: entries });

test("the numbers: members, boosts, channels, roles without @everyone", () => {
  const w = world({ memberCount: 128, boosts: 7 });
  w.add("a");
  w.add("b");
  assert.equal(statValue(w.guild, "members"), 128);
  assert.equal(statValue(w.guild, "boosts"), 7);
  assert.equal(statValue(w.guild, "channels"), 2);
  assert.equal(statValue(w.guild, "roles"), 2);
  assert.equal(statValue({ memberCount: undefined, premiumSubscriptionCount: undefined, channels: { cache: new Map() }, roles: { cache: new Map() } }, "boosts"), 0);
  assert.equal(statValue({ roles: { cache: new Map() } }, "roles"), 0);
  assert.equal(statValue(w.guild, "nonsense"), 0);
});

test("templates: {n} everywhere, cleaned and capped at 100", () => {
  assert.equal(renderStat("Thành viên: {n}", 128), "Thành viên: 128");
  assert.equal(renderStat("{n} / {n}", 5), "5 / 5");
  assert.equal(renderStat("A‮{n}\n\u0007", 5), "A5");
  assert.equal(renderStat("{n}".repeat(200), 12345).length, 100);
  assert.equal(renderStat("", 5), "");
  assert.equal(renderStat("x{n}", 0), "x0");
});

test("settings: at most four channels, no duplicates, kinds and templates cleaned", () => {
  const ids = Array.from({ length: 6 }, sf);
  const s = setSection("g-stats", "stats", {
    enabled: true,
    channels: [...ids.map((channelId) => ({ channelId, kind: "members", template: "T {n}" })), { channelId: ids[0], kind: "roles" }, { channelId: "bad", kind: "members" }, { channelId: sf(), kind: "evil", template: "x".repeat(200) }],
  });
  assert.equal(s.channels.length, 4);
  assert.equal(new Set(s.channels.map((c) => c.channelId)).size, 4);
  const odd = setSection("g-stats", "stats", { channels: [{ channelId: sf(), kind: "evil", template: "x".repeat(200) }, { channelId: sf(), kind: "boosts" }] });
  assert.equal(odd.channels[0].kind, "members");
  assert.equal(odd.channels[0].template.length, 60);
  assert.equal(odd.channels[1].template, "Thành viên: {n}");
});

test("a changed number renames the channel, an unchanged one does not", async () => {
  const w = world();
  const c = w.add("tạm");
  list(w, [{ channelId: c.id, kind: "members", template: "Thành viên: {n}" }]);
  const first = await updateGuildStats(w.guild, { now: T0 });
  assert.deepEqual(first.renamed, [c.id]);
  assert.equal(c.name, "Thành viên: 100");
  const second = await updateGuildStats(w.guild, { now: T0 + 20 * MIN });
  assert.deepEqual(second.renamed, [], "same text, no call");
  assert.equal(w.calls.length, 1);
  w.guild.memberCount = 101;
  assert.deepEqual((await updateGuildStats(w.guild, { now: T0 + 40 * MIN })).renamed, [c.id]);
  assert.equal(c.name, "Thành viên: 101");
});

test("rename throttling: once per ten minutes per channel, however often the job runs", async () => {
  const w = world();
  const c = w.add("tạm");
  list(w, [{ channelId: c.id, kind: "members", template: "M {n}" }]);
  await updateGuildStats(w.guild, { now: T0 });
  assert.equal(w.calls.length, 1);
  for (let i = 1; i <= 9; i++) {
    w.guild.memberCount += 1;
    await updateGuildStats(w.guild, { now: T0 + i * MIN });
  }
  assert.equal(w.calls.length, 1, "nine minutes of changes, no second rename");
  assert.equal(canRename(c.id, T0 + 9 * MIN), false);
  await updateGuildStats(w.guild, { now: T0 + 10 * MIN });
  assert.equal(w.calls.length, 2);
  assert.equal(c.name, "M 109", "it shows the number as it is now, not a stale one");
  // a timer that fires a hair early still renames
  w.guild.memberCount += 1;
  await updateGuildStats(w.guild, { now: T0 + 20 * MIN - 1000 });
  assert.equal(w.calls.length, 3);
  assert.equal(RENAME_GAP_MS, 10 * MIN);
  // never more than two in any ten minutes
  const times = [T0, T0 + 10 * MIN, T0 + 20 * MIN - 1000];
  for (let i = 0; i < times.length; i++) assert.ok(times.filter((t) => t >= times[i] && t < times[i] + 10 * MIN).length <= 2);
});

test("a failed rename is not retried for ten minutes", async () => {
  const w = world();
  const c = w.add("tạm");
  c.setName = async (value) => {
    w.calls.push(value);
    throw Object.assign(new Error("rate limited"), { code: 429 });
  };
  list(w, [{ channelId: c.id, kind: "members", template: "M {n}" }]);
  const base = console.error;
  console.error = () => {};
  try {
    await updateGuildStats(w.guild, { now: T0 });
    await updateGuildStats(w.guild, { now: T0 + MIN });
    await updateGuildStats(w.guild, { now: T0 + 5 * MIN });
    assert.equal(w.calls.length, 1);
    await updateGuildStats(w.guild, { now: T0 + 10 * MIN });
    assert.equal(w.calls.length, 2);
  } finally {
    console.error = base;
  }
});

test("only listed channels are touched, and only up to the plan", async () => {
  const w = world();
  const mine = w.add("mine");
  const extra = w.add("extra");
  const other = w.add("không phải của thầu");
  list(w, [
    { channelId: mine.id, kind: "members", template: "A {n}" },
    { channelId: extra.id, kind: "boosts", template: "B {n}" },
  ]);
  await updateGuildStats(w.guild, { now: T0 });
  assert.equal(mine.name, "A 100");
  assert.equal(extra.name, "extra", "free plan: one channel");
  assert.equal(other.name, "không phải của thầu");
  const pro = world({ pro: true });
  const a = pro.add("a");
  const b = pro.add("b");
  list(pro, [
    { channelId: a.id, kind: "members", template: "A {n}" },
    { channelId: b.id, kind: "roles", template: "R {n}" },
  ]);
  await updateGuildStats(pro.guild, { now: T0 });
  assert.deepEqual([a.name, b.name], ["A 100", "R 2"]);
});

test("disabled, empty, and servers that are unavailable do nothing", async () => {
  const w = world();
  const c = w.add("keep");
  list(w, [{ channelId: c.id, kind: "members", template: "M {n}" }], false);
  assert.deepEqual(await updateGuildStats(w.guild, { now: T0 }), { renamed: [], dropped: [] });
  list(w, [{ channelId: c.id, kind: "members", template: "M {n}" }], true);
  w.guild.available = false;
  assert.equal(await runStats(w.client, { now: T0 }), 0);
  assert.equal(c.name, "keep");
  w.guild.available = true;
  assert.equal(await runStats(w.client, { now: T0 }), 1);
  list(w, [], true);
  assert.deepEqual(await updateGuildStats(w.guild, { now: T0 + 30 * MIN }), { renamed: [], dropped: [] });
});

test("a channel deleted by hand is dropped from the list, a Discord error is not", async () => {
  const w = world({ pro: true });
  const gone = w.add("gone");
  const kept = w.add("kept");
  list(w, [
    { channelId: gone.id, kind: "members", template: "G {n}" },
    { channelId: kept.id, kind: "boosts", template: "K {n}" },
  ]);
  w.channels.delete(gone.id);
  const result = await updateGuildStats(w.guild, { now: T0 });
  assert.deepEqual(result.dropped, [gone.id]);
  assert.deepEqual(getSection(w.guild.id, "stats").channels.map((c) => c.channelId), [kept.id]);
  assert.equal(kept.name, "K 3");

  const flaky = world({ pro: true });
  const f = flaky.add("f");
  list(flaky, [{ channelId: f.id, kind: "members", template: "F {n}" }]);
  flaky.channels.delete(f.id);
  flaky.guild.channels.fetch = async () => {
    throw Object.assign(new Error("Service unavailable"), { code: 0 });
  };
  const out = await updateGuildStats(flaky.guild, { now: T0 });
  assert.deepEqual(out.dropped, []);
  assert.equal(getSection(flaky.guild.id, "stats").channels.length, 1, "an outage does not empty the list");
});

test("without the right to manage the channel nothing is attempted, and the missing rights are named", async () => {
  const w = world({ manage: false });
  const c = w.add("khoá");
  list(w, [{ channelId: c.id, kind: "members", template: "M {n}" }]);
  await updateGuildStats(w.guild, { now: T0 });
  assert.equal(w.calls.length, 0);
  assert.deepEqual(missingToRename(w.guild, c), ["Quản lý kênh"]);
  assert.deepEqual(missingToRename(w.guild, { permissionsFor: () => null }), ["Xem kênh", "Quản lý kênh"]);
  const ok = world();
  assert.deepEqual(missingToRename(ok.guild, ok.add("x")), []);
});

test("a channel that is not a voice channel is left alone", async () => {
  const w = world();
  const text = w.add("chat");
  text.isVoiceBased = () => false;
  list(w, [{ channelId: text.id, kind: "members", template: "M {n}" }]);
  await updateGuildStats(w.guild, { now: T0 });
  assert.equal(text.name, "chat");
});

test("the job runs every ten minutes and also sweeps temporary rooms", async () => {
  assert.equal(job.name, "stats");
  assert.equal(job.everyMs, 10 * MIN);
  const w = world();
  const c = w.add("x");
  list(w, [{ channelId: c.id, kind: "channels", template: "C {n}" }]);
  await job.run(w.client);
  assert.equal(c.name, "C 1");
});
