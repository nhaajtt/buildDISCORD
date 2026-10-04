import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Collection, MessageType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "age-test-"));

const { young, ageDays, createJoinQueue, kickRefusal, handleYoungJoin, DAY_MS } = await import("../src/security/age.js");
const { getSection, patchSection } = await import("../src/settings.js");

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

test("young() is false when the filter is off and at the exact limit, true one millisecond under", () => {
  assert.equal(young(NOW - 1000, NOW, 0), false, "0 days means off");
  assert.equal(young(NOW - 7 * DAY_MS, NOW, 7), false, "exactly seven days old is old enough");
  assert.equal(young(NOW - 7 * DAY_MS + 1, NOW, 7), true, "one millisecond short");
  assert.equal(young(NOW, NOW, 1), true, "made this instant");
  assert.equal(young(NOW - 365 * DAY_MS + 1, NOW, 365), true);
  assert.equal(young(NOW - 365 * DAY_MS, NOW, 365), false);
});

test("young() never acts on bad data", () => {
  for (const bad of [undefined, null, NaN, "abc", Infinity]) assert.equal(young(bad, NOW, 7), false);
  assert.equal(young(NOW + DAY_MS, NOW, 7), false, "a date in the future is a clock problem, not a young account");
  assert.equal(young(NOW - 1000, NaN, 7), false);
  assert.equal(young(NOW - 1000, NOW, -3), false);
  assert.equal(young(NOW - 1000, NOW, "x"), false);
});

test("ageDays counts whole days and never goes negative", () => {
  assert.equal(ageDays(NOW - 3 * DAY_MS - 5000, NOW), 3);
  assert.equal(ageDays(NOW - 100, NOW), 0);
  assert.equal(ageDays(NOW + DAY_MS, NOW), 0);
  assert.equal(ageDays(undefined, NOW), 0);
});

function fakeClock() {
  let t = 1_000_000;
  const waits = [];
  return {
    now: () => t,
    wait: async (ms) => {
      waits.push(ms);
      t += ms;
    },
    waits,
  };
}

test("the join queue runs one job at a time and spaces them out", async () => {
  const clock = fakeClock();
  const order = [];
  let active = 0;
  let maxActive = 0;
  const queue = createJoinQueue({
    gapMs: 1000,
    now: clock.now,
    wait: clock.wait,
    worker: async (job) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push([job.userId, clock.now()]);
      await Promise.resolve();
      active -= 1;
    },
  });
  for (const id of ["a", "b", "c", "d"]) assert.equal(queue.push("g1", { userId: id }), "queued");
  await queue.idle();
  assert.deepEqual(order.map((o) => o[0]), ["a", "b", "c", "d"]);
  assert.equal(maxActive, 1);
  const times = order.map((o) => o[1]);
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i] - times[i - 1] >= 1000, "at least the gap between two fetches");
  assert.equal(clock.waits.length, 3, "the first one does not wait");
});

test("the queue ignores a person already waiting and drops past its cap", async () => {
  const seen = [];
  const clock = fakeClock();
  const queue = createJoinQueue({ gapMs: 10, maxPerGuild: 3, now: clock.now, wait: clock.wait, worker: async (j) => void seen.push(j.userId) });
  assert.equal(queue.push("g", { userId: "1" }), "queued");
  assert.equal(queue.push("g", { userId: "1" }), "duplicate");
  assert.equal(queue.push("g", { userId: "2" }), "queued");
  assert.equal(queue.push("g", { userId: "3" }), "queued");
  // the first is already being handled, so three more may wait
  assert.equal(queue.push("g", { userId: "4" }), "queued");
  assert.equal(queue.push("g", { userId: "5" }), "full");
  await queue.idle();
  assert.deepEqual(seen, ["1", "2", "3", "4"]);
  // once drained the same person can be checked again (a rejoin)
  assert.equal(queue.push("g", { userId: "1" }), "queued");
  await queue.idle();
  assert.equal(seen.length, 5);
});

test("servers do not share a queue and an idle server leaves nothing behind", async () => {
  const clock = fakeClock();
  const seen = [];
  const queue = createJoinQueue({ gapMs: 1000, now: clock.now, wait: clock.wait, worker: async (j) => void seen.push(`${j.guildId}:${j.userId}`) });
  queue.push("g1", { userId: "a" });
  queue.push("g2", { userId: "a" });
  await queue.idle();
  assert.deepEqual(seen.sort(), ["g1:a", "g2:a"]);
  assert.equal(queue.size("g1"), 0);
  assert.equal(queue.size("g2"), 0);
});

test("a job that throws does not stop the queue", async () => {
  const clock = fakeClock();
  const seen = [];
  const realError = console.error;
  console.error = () => {};
  try {
    const queue = createJoinQueue({
      gapMs: 1,
      now: clock.now,
      wait: clock.wait,
      worker: async (j) => {
        seen.push(j.userId);
        if (j.userId === "bad") throw new Error("boom");
      },
    });
    queue.push("g", { userId: "bad" });
    queue.push("g", { userId: "good" });
    await queue.idle();
  } finally {
    console.error = realError;
  }
  assert.deepEqual(seen, ["bad", "good"]);
});

// ---------- who is never kicked ----------

function member({ id = "200", bot = false, roles = [], highest = 1, kickable = true } = {}) {
  const cache = new Collection(roles.map((r) => [r, { id: r }]));
  return { id, user: { id, bot }, roles: { cache, highest: { position: highest } }, kickable };
}
function guildOf({ perms = "all", top = 100, ownerId = "1" } = {}) {
  return {
    id: "g",
    ownerId,
    members: { me: { permissions: { has: (f) => perms === "all" || perms.includes(f) }, roles: { highest: { position: top } } } },
  };
}

test("kickRefusal explains each protection", () => {
  const welcome = { verifyRoleId: "900", newbieRoleId: "901" };
  assert.equal(kickRefusal(guildOf(), member(), welcome), null);
  assert.equal(kickRefusal(guildOf({ ownerId: "200" }), member({ id: "200" }), welcome), "owner");
  assert.equal(kickRefusal(guildOf(), member({ bot: true }), welcome), "bot");
  assert.equal(kickRefusal(guildOf(), member({ roles: ["900"] }), welcome), "welcomed");
  assert.equal(kickRefusal(guildOf(), member({ roles: ["901"] }), welcome), "welcomed");
  assert.equal(kickRefusal(guildOf(), member({ roles: ["555"] }), welcome), null, "an unrelated role does not protect");
  assert.equal(kickRefusal(guildOf({ top: 5 }), member({ highest: 5 }), welcome), "above");
  assert.equal(kickRefusal(guildOf({ top: 5 }), member({ highest: 9 }), welcome), "above");
  assert.equal(kickRefusal(guildOf(), member({ kickable: false }), welcome), "above");
});

test("kickRefusal reports a missing Kick Members permission", () => {
  assert.equal(kickRefusal(guildOf({ perms: [P.BanMembers] }), member(), { verifyRoleId: null, newbieRoleId: null }), "perm");
});

// ---------- the join hook ----------

const joinNotice = (over = {}) => ({
  id: "m1",
  type: MessageType.UserJoin,
  guild: { id: "gh1" },
  author: { id: "u1", bot: false },
  ...over,
});

test("the join hook queues only real joins in servers that switched the filter on", () => {
  const pushed = [];
  const queue = { push: (guildId, job) => (pushed.push([guildId, job.userId]), "queued") };
  assert.equal(handleYoungJoin(joinNotice(), { queue }), "off", "off by default");
  patchSection("gh1", "security", { minAccountAgeDays: 7 });
  assert.equal(getSection("gh1", "security").minAccountAgeDays, 7);
  assert.equal(handleYoungJoin(joinNotice({ type: MessageType.Default }), { queue }), "ignored");
  assert.equal(handleYoungJoin(joinNotice({ author: { id: "b", bot: true } }), { queue }), "ignored");
  assert.equal(handleYoungJoin(joinNotice({ guild: null }), { queue }), "ignored");
  assert.equal(handleYoungJoin(joinNotice({ id: "m2" }), { queue }), "queued");
  assert.equal(handleYoungJoin(joinNotice({ id: "m2" }), { queue }), "duplicate", "the same notice twice is one check");
  assert.deepEqual(pushed, [["gh1", "u1"]]);
});

test("the hook never throws", () => {
  assert.equal(handleYoungJoin(null), "ignored");
  const bad = {
    type: MessageType.UserJoin,
    guild: {
      get id() {
        throw new Error("x");
      },
    },
    author: { bot: false },
  };
  const realError = console.error;
  console.error = () => {};
  try {
    assert.equal(handleYoungJoin(bad), "error");
  } finally {
    console.error = realError;
  }
});
