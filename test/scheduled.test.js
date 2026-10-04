import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "scheduled-test-"));

const sched = await import("../src/jobs/scheduled.js");
const { grant } = await import("../src/license.js");
const { getDb } = await import("../src/db.js");

const { nextAfter, decide, cleanBody, createScheduled, runScheduled, MAX_LATE_MS, MAX_BODY, listScheduled, countScheduled, removeScheduled, getScheduled } = sched;

const HCM = "Asia/Ho_Chi_Minh";
const NY = "America/New_York";
const HOUR = 3_600_000;
let n = 0;
const sf = () => `96${String(++n).padStart(16, "0")}`;
const row = (id) => getDb().prepare("SELECT * FROM scheduled_messages WHERE id = ?").get(id);

// ---------------------------------------------------------------- next occurrence

test("daily in Vietnam: before, at and after the time, and across midnight", () => {
  const at = (h, m = 0, day = 3) => Date.UTC(2026, 9, day, h - 7, m);
  assert.equal(nextAfter({ hhmm: "08:30" }, at(8, 29), HCM), at(8, 30));
  assert.equal(nextAfter({ hhmm: "08:30" }, at(8, 30), HCM), at(8, 30, 4), "strictly after now: at the exact time it is tomorrow's");
  assert.equal(nextAfter({ hhmm: "08:30" }, at(23, 59), HCM), at(8, 30, 4));
  assert.equal(nextAfter({ hhmm: "00:00" }, at(23, 59), HCM), at(0, 0, 4));
  assert.equal(nextAfter({ hhmm: "00:00" }, at(0, 0), HCM), at(0, 0, 4));
  assert.equal(nextAfter({ hhmm: "23:59" }, at(0, 0), HCM), at(23, 59));
  // 17:00 UTC on the 3rd is already midnight of the 4th in Vietnam
  assert.equal(nextAfter({ hhmm: "00:10" }, Date.UTC(2026, 9, 3, 17, 5), HCM), Date.UTC(2026, 9, 3, 17, 10));
  assert.equal(nextAfter({ hhmm: "00:10" }, Date.UTC(2026, 9, 3, 17, 10), HCM), Date.UTC(2026, 9, 4, 17, 10));
  // month and year ends
  assert.equal(nextAfter({ hhmm: "06:00" }, Date.UTC(2026, 11, 31, 20, 0), HCM), Date.UTC(2026, 11, 31, 23, 0));
  assert.equal(nextAfter({ hhmm: "06:00" }, Date.UTC(2026, 11, 31, 23, 0), HCM), Date.UTC(2027, 0, 1, 23, 0));
  assert.equal(nextAfter({ hhmm: "06:00" }, Date.UTC(2028, 1, 28, 23, 30), HCM), Date.UTC(2028, 1, 29, 23, 0), "leap day");
});

test("weekly: the weekday in the zone, not in UTC", () => {
  const sat = Date.UTC(2026, 9, 3, 12, 0); // Saturday 19:00 in Vietnam
  assert.equal(nextAfter({ weekday: 6, hhmm: "20:00" }, sat, HCM), Date.UTC(2026, 9, 3, 13, 0));
  assert.equal(nextAfter({ weekday: 6, hhmm: "18:00" }, sat, HCM), Date.UTC(2026, 9, 10, 11, 0), "already passed today: next week");
  assert.equal(nextAfter({ weekday: 0, hhmm: "09:00" }, sat, HCM), Date.UTC(2026, 9, 4, 2, 0));
  assert.equal(nextAfter({ weekday: 1, hhmm: "00:30" }, sat, HCM), Date.UTC(2026, 9, 4, 17, 30), "Monday 00:30 in Vietnam is still Sunday in UTC");
  // 23:00 UTC on Saturday is already Sunday morning in Vietnam
  const lateSat = Date.UTC(2026, 9, 3, 23, 0);
  assert.equal(nextAfter({ weekday: 0, hhmm: "07:30" }, lateSat, HCM), Date.UTC(2026, 9, 4, 0, 30));
});

test("another zone with daylight saving: New York around the clock changes", () => {
  // 2026-03-08: clocks jump 02:00 to 03:00. 09:00 is UTC-4 afterwards, UTC-5 before.
  const before = Date.UTC(2026, 2, 7, 15, 0); // Saturday 10:00 EST
  assert.equal(nextAfter({ hhmm: "09:00" }, before, NY), Date.UTC(2026, 2, 8, 13, 0), "Sunday 09:00 is already EDT, 13:00 UTC");
  assert.equal(nextAfter({ hhmm: "09:00" }, Date.UTC(2026, 2, 8, 13, 0), NY), Date.UTC(2026, 2, 9, 13, 0));
  // 2026-11-01: clocks go back 02:00 to 01:00
  const fall = Date.UTC(2026, 9, 31, 14, 0); // Saturday 10:00 EDT
  assert.equal(nextAfter({ hhmm: "09:00" }, fall, NY), Date.UTC(2026, 10, 1, 14, 0), "Sunday 09:00 is EST, 14:00 UTC");
  assert.equal(nextAfter({ weekday: 0, hhmm: "09:00" }, fall, NY), Date.UTC(2026, 10, 1, 14, 0));
  // a day that is 23 or 25 hours long still gives one occurrence per calendar day
  let t = Date.UTC(2026, 2, 6, 15, 0);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    t = nextAfter({ hhmm: "09:00" }, t, NY);
    seen.push(t);
  }
  assert.deepEqual(seen.map((x, i) => (i ? x - seen[i - 1] : 0)), [0, 23 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR]);
  // Europe/London for good measure: BST starts 2026-03-29
  assert.equal(nextAfter({ hhmm: "12:00" }, Date.UTC(2026, 2, 28, 13, 0), "Europe/London"), Date.UTC(2026, 2, 29, 11, 0));
  // east of Greenwich the other way round: Sydney at 06:00 vs UTC date
  assert.equal(nextAfter({ hhmm: "06:00" }, Date.UTC(2026, 5, 10, 10, 0), "Australia/Sydney"), Date.UTC(2026, 5, 10, 20, 0));
});

test("bad times are rejected", () => {
  assert.throws(() => nextAfter({ hhmm: "25:00" }, 0, HCM), /invalid time/);
  assert.throws(() => nextAfter({ hhmm: "" }, 0, HCM), /invalid time/);
  assert.throws(() => nextAfter({ hhmm: "8h" }, 0, HCM), /invalid time/);
});

// ---------------------------------------------------------------- what to do with a row

test("decide: not due, due and fresh, due but stale; the next time is always after now", () => {
  const day = Date.UTC(2026, 9, 4, 1, 30); // 08:30 in Vietnam
  const base = { weekday: null, hhmm: "08:30", next_at: day };
  assert.deepEqual(decide(base, day - 1, HCM), { due: false });
  const ontime = decide(base, day, HCM);
  assert.equal(ontime.due, true);
  assert.equal(ontime.send, true);
  assert.equal(ontime.nextAt, day + 24 * HOUR);
  const late = decide(base, day + 5 * HOUR, HCM);
  assert.equal(late.send, true, "missed by five hours: caught up");
  assert.equal(late.nextAt, day + 24 * HOUR);
  const edge = decide(base, day + MAX_LATE_MS, HCM);
  assert.equal(edge.send, true);
  assert.equal(decide(base, day + MAX_LATE_MS + 1, HCM).send, false, "past the window: skipped");
  const week = decide(base, day + 4 * 24 * HOUR + HOUR, HCM);
  assert.equal(week.send, false, "four days down: nothing is posted late");
  assert.equal(week.nextAt, day + 5 * 24 * HOUR, "and the next time is the next morning, not a replay of the missed days");
  const weekly = decide({ weekday: 0, hhmm: "08:30", next_at: day }, day + HOUR, HCM);
  assert.equal(weekly.nextAt, day + 7 * 24 * HOUR);
});

// ---------------------------------------------------------------- text

test("the body: typed \\n, hidden characters, blank runs, cap", () => {
  assert.equal(cleanBody("a\\nb"), "a\nb");
  assert.equal(cleanBody("  hi‮​\u0007 there \r\n\r\n\r\n\r\nend  "), "hi there\n\nend");
  assert.equal(cleanBody("x".repeat(5000)).length, MAX_BODY);
  assert.equal(cleanBody("​‮  \n "), "");
  assert.equal(cleanBody(null), "");
  assert.equal(cleanBody(42), "");
  assert.equal(cleanBody("<@&1> @everyone"), "<@&1> @everyone", "mentions are kept as text; they cannot ping, see the job");
  assert.equal(MAX_BODY, 1500);
});

// ---------------------------------------------------------------- the table and the job with plain fakes

function world({ pro = true, canSend = true } = {}) {
  const guildId = sf();
  if (pro) grant(guildId, "pro", 30, Date.UTC(2026, 9, 1));
  const sent = [];
  const channel = {
    id: sf(),
    permissionsFor: () => ({ has: (f) => canSend || f === "ViewChannel" }),
    send: async (payload) => {
      sent.push(payload);
      return { id: sf() };
    },
  };
  const channels = new Map([[channel.id, channel]]);
  const guild = { id: guildId, available: true, members: { me: {} }, channels: { cache: channels, fetch: async (id) => channels.get(id) ?? Promise.reject(Object.assign(new Error("Unknown Channel"), { code: 10003 })) } };
  return { guild, channel, sent, channels, client: { guilds: { cache: new Map([[guildId, guild]]) } } };
}

const make = (w, o = {}) => createScheduled({ guildId: w.guild.id, channelId: w.channel.id, body: "xin chào", hhmm: "08:30", createdBy: "u1", now: Date.UTC(2026, 9, 3, 12, 0), timeZone: HCM, ...o });
const T = (day, h, m = 0) => Date.UTC(2026, 9, day, h - 7, m);

test("create, list, get, count and remove are scoped to the server", () => {
  const a = world();
  const b = world();
  const one = make(a);
  const two = make(a, { weekday: 3, hhmm: "21:00" });
  make(b);
  assert.equal(one.nextAt, T(4, 8, 30));
  assert.equal(countScheduled(a.guild.id), 2);
  assert.deepEqual(listScheduled(a.guild.id).map((r) => r.id), [one.id, two.id]);
  assert.equal(getScheduled(a.guild.id, two.id).weekday, 3);
  assert.equal(getScheduled(b.guild.id, two.id), null);
  assert.equal(removeScheduled(b.guild.id, two.id), false);
  assert.equal(removeScheduled(a.guild.id, two.id), true);
  assert.equal(countScheduled(a.guild.id), 1);
  assert.throws(() => make(a, { hhmm: "99:99" }), /invalid time/);
});

test("the job posts when due, with no mention allowed, and moves the due time first", async () => {
  const w = world();
  const { id } = make(w, { body: "@everyone <@&123456789012345678> chào" });
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 29), timeZone: HCM }), 0);
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 30), timeZone: HCM }), 1);
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 30), timeZone: HCM }), 0);
  assert.deepEqual(w.sent, [{ content: "@everyone <@&123456789012345678> chào", allowedMentions: { parse: [] } }]);
  assert.equal(row(id).next_at, T(5, 8, 30));
  assert.equal(row(id).last_sent_at, T(4, 8, 30));
});

test("exactly once: many overlapping runs, and a send that throws", async () => {
  const w = world();
  const { id } = make(w);
  const now = T(4, 9, 0);
  await Promise.all(Array.from({ length: 6 }, () => runScheduled(w.client, { now, timeZone: HCM })));
  assert.equal(w.sent.length, 1);

  const f = world();
  const failing = make(f);
  f.channel.send = async () => {
    throw new Error("boom");
  };
  const base = console.error;
  console.error = () => {};
  try {
    await runScheduled(f.client, { now: T(4, 8, 30), timeZone: HCM });
    await runScheduled(f.client, { now: T(4, 8, 31), timeZone: HCM });
  } finally {
    console.error = base;
  }
  assert.equal(row(failing.id).next_at, T(5, 8, 30), "claimed before the attempt");
  assert.equal(row(failing.id).last_sent_at, null);
  assert.equal(row(id).status, "active");
});

test("the claim itself is atomic: a stale copy of the row cannot win a second time", async () => {
  const w = world();
  const { id } = make(w);
  const stale = { ...row(id) };
  await runScheduled(w.client, { now: T(4, 8, 30), timeZone: HCM });
  const claimed = getDb().prepare("UPDATE scheduled_messages SET next_at = ? WHERE id = ? AND next_at = ? AND status = 'active'").run(T(5, 8, 30), id, stale.next_at);
  assert.equal(Number(claimed.changes), 0);
  assert.equal(w.sent.length, 1);
});

test("restart: a row is picked up from the database, one missed occurrence is caught up and older ones are skipped", async () => {
  const w = world();
  const { id } = make(w);
  // nothing in memory is needed: a later run alone does the work
  assert.equal(await runScheduled(w.client, { now: T(4, 14, 0), timeZone: HCM }), 1, "five and a half hours late");
  assert.equal(row(id).next_at, T(5, 8, 30));
  assert.equal(await runScheduled(w.client, { now: T(9, 10, 0), timeZone: HCM }), 0, "four mornings missed: none posted");
  assert.equal(row(id).next_at, T(10, 8, 30));
  assert.equal(await runScheduled(w.client, { now: T(9, 10, 1), timeZone: HCM }), 0);
  assert.equal(w.sent.length, 1);
});

test("channel problems: unwritable is retried, deleted pauses, an unknown error is retried", async () => {
  const w = world({ canSend: false });
  const { id } = make(w);
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 30), timeZone: HCM }), 0);
  assert.equal(row(id).next_at, T(4, 8, 30), "not claimed");
  w.channel.permissionsFor = () => ({ has: () => true });
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 31), timeZone: HCM }), 1);

  const gone = world();
  const g = make(gone);
  gone.channels.delete(gone.channel.id);
  await runScheduled(gone.client, { now: T(4, 8, 30), timeZone: HCM });
  assert.equal(row(g.id).status, "broken");
  assert.equal(await runScheduled(gone.client, { now: T(5, 8, 30), timeZone: HCM }), 0);

  const flaky = world();
  const f = make(flaky);
  flaky.channels.delete(flaky.channel.id);
  flaky.guild.channels.fetch = async () => {
    throw Object.assign(new Error("Service unavailable"), { code: 0 });
  };
  await runScheduled(flaky.client, { now: T(4, 8, 30), timeZone: HCM });
  assert.equal(row(f.id).status, "active", "an outage does not pause the schedule");
  assert.equal(row(f.id).next_at, T(4, 8, 30));
});

test("plan: a lapsed plan posts nothing, a smaller plan covers the oldest rows only", async () => {
  const free = world({ pro: false });
  const { id } = make(free);
  assert.equal(await runScheduled(free.client, { now: T(4, 8, 30), timeZone: HCM }), 0);
  assert.equal(row(id).next_at, T(4, 8, 30), "left untouched");

  const w = world();
  const ids = Array.from({ length: 7 }, () => make(w).id);
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 30), timeZone: HCM }), 5, "Pro covers five");
  assert.equal(row(ids[5]).next_at, T(4, 8, 30));
  assert.equal(row(ids[0]).next_at, T(5, 8, 30));
});

test("servers that are not loaded or unavailable are skipped, and rows of a server gone for a month are forgotten", async () => {
  const w = world();
  const { id } = make(w);
  w.guild.available = false;
  assert.equal(await runScheduled(w.client, { now: T(4, 8, 30), timeZone: HCM }), 0);
  assert.equal(row(id).next_at, T(4, 8, 30));
  w.guild.available = true;
  const empty = { guilds: { cache: new Map() } };
  assert.equal(await runScheduled(empty, { now: T(4, 8, 30), timeZone: HCM }), 0);
  assert.ok(row(id));
  assert.equal(await runScheduled(empty, { now: T(4, 8, 30) + 31 * 24 * HOUR, timeZone: HCM }), 0);
  assert.equal(row(id), undefined);
});

test("one tick posts at most 25 messages, and the rest come on the next tick", async () => {
  const w = world();
  const g2 = [];
  for (let i = 0; i < 6; i++) {
    const other = world();
    // Pro covers 5 per server, so six servers carry thirty rows
    for (let j = 0; j < 5; j++) make(other);
    g2.push(other);
  }
  const client = { guilds: { cache: new Map(g2.map((o) => [o.guild.id, o.guild])) } };
  assert.equal(await runScheduled(client, { now: T(4, 8, 30), timeZone: HCM }), 25);
  assert.equal(await runScheduled(client, { now: T(4, 8, 31), timeZone: HCM }), 5);
  assert.equal(await runScheduled(client, { now: T(4, 8, 32), timeZone: HCM }), 0);
  assert.ok(w);
});

test("the job module", () => {
  assert.equal(sched.default.name, "scheduled");
  assert.equal(sched.default.everyMs, 30_000);
});
