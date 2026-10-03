import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "games-test-"));
process.env.BUILD_STEP_DELAY_MS = "0";

const points = await import("../src/games/points.js");
const { planLevelRoles, applyLevelRoles, levelRoleName } = await import("../src/games/levelroles.js");
const doanso = await import("../src/games/doanso.js");
const rps = await import("../src/games/rps.js");
const trivia = await import("../src/games/trivia.js");
const { QUESTIONS } = await import("../src/games/questions.js");
const { loadRecord } = await import("../src/store.js");
const { grant } = await import("../src/license.js");
const { gateFeature } = await import("../src/utils/gate.js");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VN = "Asia/Ho_Chi_Minh";
// Saturday 10 January 2026, 10:00 in Vietnam
const T0 = Date.UTC(2026, 0, 10, 3, 0);

test("levels follow the thresholds and report the next one", () => {
  assert.equal(points.levelFor(0).index, 0);
  assert.equal(points.levelFor(49).index, 0);
  assert.equal(points.levelFor(50).index, 1);
  assert.equal(points.levelFor(1199).index, 4);
  assert.equal(points.levelFor(1200).index, 5);
  assert.equal(points.levelFor(5000).next, null);
  assert.equal(points.levelFor(60).next, 150);
  assert.equal(points.LEVELS.length, 6);
});

test("a day is the person's day: 00:30 in Vietnam is already tomorrow", () => {
  const before = Date.UTC(2026, 0, 10, 16, 30);
  const after = Date.UTC(2026, 0, 10, 17, 30);
  assert.equal(points.dayKey(before, VN), "2026-01-10");
  assert.equal(points.dayKey(after, VN), "2026-01-11");
  assert.equal(points.dayKey(before, "UTC"), points.dayKey(after, "UTC"));
});

test("the previous day crosses month, year and leap-day boundaries", () => {
  assert.equal(points.previousDay("2026-03-01"), "2026-02-28");
  assert.equal(points.previousDay("2026-01-01"), "2025-12-31");
  assert.equal(points.previousDay("2028-03-01"), "2028-02-29");
});

test("check-in rules: first day, same day, consecutive days, a missed day, and the bonus cap", () => {
  assert.deepEqual(points.checkinResult({ lastCheckin: null, streak: 0 }, "2026-01-10"), { status: "ok", streak: 1, bonus: 0, points: 10 });
  assert.equal(points.checkinResult({ lastCheckin: "2026-01-10", streak: 3 }, "2026-01-10").status, "already");
  assert.deepEqual(points.checkinResult({ lastCheckin: "2026-01-10", streak: 1 }, "2026-01-11"), { status: "ok", streak: 2, bonus: 2, points: 12 });
  assert.deepEqual(points.checkinResult({ lastCheckin: "2026-01-08", streak: 9 }, "2026-01-10"), { status: "ok", streak: 1, bonus: 0, points: 10 });
  assert.equal(points.checkinResult({ lastCheckin: "2026-01-10", streak: 10 }, "2026-01-11").bonus, 20);
  assert.equal(points.checkinResult({ lastCheckin: "2026-01-10", streak: 40 }, "2026-01-11").bonus, 20);
});

test("check-in in the database: rollover, a missed day and the time zone boundary", () => {
  const g = "g-checkin";
  const first = points.checkIn(g, "u1", { now: T0, timeZone: VN });
  assert.equal(first.status, "ok");
  assert.equal(first.after, 10);
  assert.equal(points.checkIn(g, "u1", { now: T0 + 2 * HOUR, timeZone: VN }).status, "already");

  const next = points.checkIn(g, "u1", { now: T0 + DAY, timeZone: VN });
  assert.equal(next.streak, 2);
  assert.equal(next.after, 22);

  const missed = points.checkIn(g, "u1", { now: T0 + 3 * DAY, timeZone: VN });
  assert.equal(missed.streak, 1, "a missed day resets the streak");
  assert.equal(missed.after, 32);

  // 23:30 and 00:30 in Vietnam are on one UTC day but two local days
  const late = Date.UTC(2026, 5, 10, 16, 30);
  const early = Date.UTC(2026, 5, 10, 17, 30);
  assert.equal(points.checkIn(g, "vn", { now: late, timeZone: VN }).status, "ok");
  assert.equal(points.checkIn(g, "vn", { now: early, timeZone: VN }).status, "ok", "the local day changed");
  assert.equal(points.checkIn(g, "utc", { now: late, timeZone: "UTC" }).status, "ok");
  assert.equal(points.checkIn(g, "utc", { now: early, timeZone: "UTC" }).status, "already", "same day in UTC");
});

test("the leaderboard sorts by points, hides zeros and respects the limit", () => {
  const g = "g-board";
  points.addPoints(g, "a", 30, { now: 1 });
  points.addPoints(g, "b", 90, { now: 2 });
  points.addPoints(g, "c", 60, { now: 3 });
  assert.deepEqual(points.leaderboard(g, 10).map((r) => r.userId), ["b", "c", "a"]);
  assert.equal(points.leaderboard(g, 2).length, 2);
  assert.deepEqual(points.leaderboard("g-empty", 10), []);
  assert.deepEqual(points.addPoints(g, "a", 5, { now: 4 }), { before: 30, after: 35 });
});

test("game points are capped at 100 per person per local day and reset the next day", () => {
  points.resetGameCaps();
  const g = "g-cap";
  assert.equal(points.awardGamePoints(g, "u", 60, { now: T0, timeZone: VN }).granted, 60);
  const partial = points.awardGamePoints(g, "u", 60, { now: T0 + HOUR, timeZone: VN });
  assert.equal(partial.granted, 40);
  assert.equal(partial.capped, true);
  const none = points.awardGamePoints(g, "u", 10, { now: T0 + 2 * HOUR, timeZone: VN });
  assert.equal(none.granted, 0);
  assert.equal(none.after, 100);
  assert.equal(points.awardGamePoints(g, "u", 10, { now: T0 + DAY, timeZone: VN }).granted, 10);
  assert.equal(points.awardGamePoints(g, "other", 15, { now: T0, timeZone: VN }).granted, 15, "the cap is per person");
});

test("level role planning gives the current role and removes the others", () => {
  const names = points.LEVELS.map(levelRoleName);
  assert.deepEqual(planLevelRoles([], 0), { level: points.levelFor(0), give: names[0], remove: [] });
  const up = planLevelRoles([names[0], "Mod"], 60);
  assert.equal(up.give, names[1]);
  assert.deepEqual(up.remove, [names[0]]);
  const same = planLevelRoles([names[1]], 60);
  assert.equal(same.give, null);
  assert.deepEqual(same.remove, []);
  assert.deepEqual(planLevelRoles([names[3], names[1]], 60).remove, [names[3]], "a role above the current level is taken away too");
});

function fakeServer({ manageRoles = true, editable = true } = {}) {
  const roles = new Map();
  let id = 100;
  const memberRoles = new Map();
  const guild = {
    id: "g-roles",
    members: { me: { permissions: { has: (name) => manageRoles && name === "ManageRoles" } } },
    roles: {
      cache: roles,
      create: async (options) => {
        const role = { id: String(id++), name: options.name, editable, options };
        roles.set(role.id, role);
        return role;
      },
    },
  };
  const member = {
    roles: {
      cache: memberRoles,
      add: async (role) => memberRoles.set(role.id, role),
      remove: async (role) => memberRoles.delete(role.id),
    },
  };
  return { guild, member, roles, memberRoles };
}

test("level roles are created once, recorded for nuke, never self-assignable, and moved up with the level", async () => {
  const { guild, member, roles, memberRoles } = fakeServer();
  assert.equal(await applyLevelRoles(guild, member, 60), true);
  const created = [...roles.values()].map((r) => r.name);
  assert.deepEqual(created, [levelRoleName(points.LEVELS[1])]);
  assert.ok([...memberRoles.values()].some((r) => r.name === created[0]));

  const record = loadRecord("g-roles");
  assert.ok(record.roles.includes([...roles.values()][0].id), "recorded so /nuke can remove it");
  assert.equal(record.pickRoles.length, 0, "never in the self-assign list");

  assert.equal(await applyLevelRoles(guild, member, 200), true);
  const names = [...memberRoles.values()].map((r) => r.name);
  assert.deepEqual(names, [levelRoleName(points.LEVELS[2])], "the lower role was removed");
  assert.equal(roles.size, 2, "an existing role is reused, not duplicated");
  assert.equal(await applyLevelRoles(guild, member, 200), false, "nothing to do the second time");
});

test("level roles are skipped quietly without permission or when the role is above the bot", async () => {
  const noPerm = fakeServer({ manageRoles: false });
  assert.equal(await applyLevelRoles(noPerm.guild, noPerm.member, 60), false);
  assert.equal(noPerm.roles.size, 0);

  const above = fakeServer({ editable: false });
  await applyLevelRoles(above.guild, above.member, 60);
  assert.equal(above.memberRoles.size, 0, "a role the bot cannot edit is not handed out");

  const broken = fakeServer();
  broken.guild.roles.create = async () => {
    throw new Error("Missing Permissions");
  };
  assert.equal(await applyLevelRoles(broken.guild, broken.member, 60), false, "errors never escape");
});

test("guess the number: higher, lower, win, one round per server, expiry and a new round", () => {
  doanso.resetDoanso();
  const random = () => 0.41; // secret 42
  assert.deepEqual(doanso.guess("g", 10, { now: 0 }), { status: "none" });
  const start = doanso.startRound("g", { now: 0, random });
  assert.equal(start.started, true);
  assert.equal(doanso.startRound("g", { now: 1000, random: () => 0.9 }).started, false, "a running round is kept");
  assert.equal(doanso.guess("g", 10, { now: 1000 }).status, "higher");
  assert.equal(doanso.guess("g", 90, { now: 1000 }).status, "lower");
  const win = doanso.guess("g", 42, { now: 1000 });
  assert.deepEqual(win, { status: "win", attempts: 3 });
  assert.equal(doanso.guess("g", 42, { now: 1000 }).status, "none", "the round ends on a win");

  doanso.startRound("g2", { now: 0, random });
  const late = doanso.guess("g2", 5, { now: doanso.ROUND_TTL_MS + 1 });
  assert.deepEqual(late, { status: "expired", secret: 42 });
  assert.equal(doanso.startRound("g3", { now: 0, random: () => 0 }).started, true);
  assert.equal(doanso.guess("g3", 1, { now: 5 }).status, "win", "random() = 0 gives 1");
  assert.equal(doanso.startRound("g4", { now: 0, random: () => 0.999999 }).started, true);
  assert.equal(doanso.guess("g4", 100, { now: 5 }).status, "win", "random() just under 1 gives 100");
});

test("rock paper scissors decides every pairing", () => {
  const expected = { "keo-keo": "tie", "keo-bua": "b", "keo-bao": "a", "bua-keo": "a", "bua-bua": "tie", "bua-bao": "b", "bao-keo": "b", "bao-bua": "a", "bao-bao": "tie" };
  for (const a of rps.MOVES) for (const b of rps.MOVES) assert.equal(rps.rps(a, b), expected[`${a}-${b}`], `${a} vs ${b}`);
});

test("a duel: strangers refused, one choice each, waiting then done, winner and tie", () => {
  rps.resetDuels();
  const id = rps.createDuel({ guildId: "g", challengerId: "A", targetId: "B" }, { now: 0 });
  assert.equal(rps.chooseMove(id, "C", "bua", { now: 1 }).status, "stranger");
  assert.equal(rps.chooseMove(id, "A", "laser", { now: 1 }).status, "invalid");
  assert.deepEqual(rps.chooseMove(id, "A", "bua", { now: 1 }), { status: "waiting", move: "bua" });
  assert.deepEqual(rps.chooseMove(id, "A", "bao", { now: 2 }), { status: "locked", move: "bua" });
  const done = rps.chooseMove(id, "B", "keo", { now: 3 });
  assert.equal(done.status, "done");
  assert.equal(done.winnerId, "A");
  assert.equal(done.loserId, "B");
  assert.equal(rps.chooseMove(id, "B", "keo", { now: 4 }).status, "missing", "a finished duel is gone");

  const tieId = rps.createDuel({ guildId: "g", challengerId: "A", targetId: "B" }, { now: 0 });
  rps.chooseMove(tieId, "B", "bao", { now: 1 });
  const tie = rps.chooseMove(tieId, "A", "bao", { now: 1 });
  assert.equal(tie.tie, true);
  assert.equal(tie.winnerId, null);

  const slow = rps.createDuel({ guildId: "g", challengerId: "A", targetId: "B" }, { now: 0 });
  assert.equal(rps.isPending(slow, { now: rps.DUEL_TTL_MS - 1 }), true);
  assert.equal(rps.chooseMove(slow, "A", "bua", { now: rps.DUEL_TTL_MS + 1 }).status, "expired");
  const cancelled = rps.createDuel({ guildId: "g", challengerId: "A", targetId: "B" }, { now: 0 });
  rps.cancelDuel(cancelled);
  assert.equal(rps.isPending(cancelled, { now: 1 }), false);
});

test("trivia: one try each, the first right answer wins, and rounds end by time", () => {
  trivia.resetTrivia();
  const round = trivia.startTrivia("g", { now: 0, random: () => 0 });
  assert.equal(round.started, true);
  assert.equal(trivia.startTrivia("g", { now: 1000 }).started, false, "one open question at a time");
  const right = round.question.answer;
  const wrong = (right + 1) % 4;

  assert.equal(trivia.answerTrivia(round.roundId, "u1", wrong, { now: 2000 }).status, "wrong");
  assert.equal(trivia.answerTrivia(round.roundId, "u1", right, { now: 2000 }).status, "tried", "no second try");
  const win = trivia.answerTrivia(round.roundId, "u2", right, { now: 3000 });
  assert.equal(win.status, "correct");
  assert.equal(win.winnerId, "u2");
  assert.equal(trivia.answerTrivia(round.roundId, "u3", right, { now: 3000 }).status, "closed");
  assert.equal(trivia.answerTrivia("nope", "u3", 0, { now: 0 }).status, "missing");

  const next = trivia.startTrivia("g", { now: 5000, random: () => 0 });
  assert.equal(next.started, true, "a new question after the last one was won");
  const late = trivia.answerTrivia(next.roundId, "u9", 0, { now: 5000 + trivia.ROUND_TTL_MS + 1 });
  assert.equal(late.status, "expired");
  assert.equal(late.correctIndex, next.question.answer);
  assert.equal(trivia.isOpen(next.roundId, { now: 5001 }), false, "an expired answer closes the round");
});

test("trivia does not repeat the last eight questions in a server", () => {
  trivia.resetTrivia();
  const seen = [];
  for (let i = 0; i < 8; i++) {
    const round = trivia.startTrivia("g-recent", { now: i * 1000, random: () => 0 });
    seen.push(round.question.q);
    trivia.closeRound(round.roundId);
  }
  assert.equal(new Set(seen).size, 8);
});

test("every trivia question is well formed", () => {
  assert.ok(QUESTIONS.length >= 30);
  const texts = new Set();
  const positions = new Set();
  for (const item of QUESTIONS) {
    assert.equal(item.options.length, 4, item.q);
    assert.equal(new Set(item.options).size, 4, `${item.q} has repeated options`);
    assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4, item.q);
    assert.ok(!texts.has(item.q), `duplicate question: ${item.q}`);
    texts.add(item.q);
    positions.add(item.answer);
    assert.ok(item.q.length <= 200, item.q);
    for (const option of item.options) assert.ok(`A. ${option}`.length <= 80, `${item.q}: label too long`);
  }
  assert.equal(positions.size, 4, "the right answer is not always in the same place");
});

test("the games are a Pro feature", () => {
  assert.match(gateFeature("g-free-games", "games"), /Pro/);
  grant("g-pro-games", "pro", 30);
  assert.equal(gateFeature("g-pro-games", "games"), null);
});

function interaction(guildId, userId, options = {}) {
  const replies = [];
  return {
    replies,
    guildId,
    guild: { id: guildId, members: {} },
    member: { roles: { cache: new Map() } },
    user: { id: userId, bot: false },
    options: { getInteger: (n) => options[n] ?? null, getUser: (n) => options[n] ?? null },
    reply: async (payload) => replies.push(payload),
  };
}

test("the commands answer a free server with the upgrade message and a Pro server with the game", async () => {
  const { default: diemdanh } = await import("../src/commands/diemdanh.js");
  const { default: doansoCommand } = await import("../src/commands/doanso.js");
  const free = interaction("g-free-cmd", "u1");
  await diemdanh.execute(free);
  assert.match(free.replies[0].content, /Pro/);

  grant("g-pro-cmd", "pro", 30);
  const pro = interaction("g-pro-cmd", "u1");
  await diemdanh.execute(pro);
  assert.match(pro.replies[0].content, /Điểm danh xong/);
  assert.match(pro.replies[0].content, /Lên cấp/, "the first check-in welcomes the first level");
  const again = interaction("g-pro-cmd", "u1");
  await diemdanh.execute(again);
  assert.doesNotMatch(again.replies[0].content, /Điểm danh xong/);

  doanso.resetDoanso();
  const start = interaction("g-pro-cmd", "u1");
  await doansoCommand.execute(start);
  assert.match(start.replies[0].content, /1 đến 100/);
  const guessing = interaction("g-pro-cmd", "u2", { so: 50 });
  await doansoCommand.execute(guessing);
  assert.match(guessing.replies[0].content, /cao hơn|thấp hơn|đoán trúng/);
});

test("all six game commands load, have unique names and valid Discord definitions", async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "commands");
  const mine = ["diemdanh", "bangxephang", "doanso", "thachdau", "cauhoi", "sukien"];
  const names = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const { default: command } = await import(pathToFileURL(path.join(dir, file)).href);
    const json = command.data.toJSON();
    assert.ok(!names.has(json.name), `duplicate command ${json.name}`);
    names.add(json.name);
    if (!mine.includes(json.name)) continue;
    assert.ok(json.description.length <= 100, json.name);
    assert.equal(typeof command.execute, "function");
    const walk = (options = []) => {
      for (const option of options) {
        assert.match(option.name, /^[a-z0-9_-]{1,32}$/, `${json.name}: option ${option.name}`);
        assert.ok(option.description.length <= 100, `${json.name}.${option.name}`);
        walk(option.options);
      }
    };
    walk(json.options);
  }
  for (const name of mine) assert.ok(names.has(name), name);
});
