import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "events-test-"));

const schedule = await import("../src/games/schedule.js");
const { runEvents } = await import("../src/jobs/events.js");
const { getDb } = await import("../src/db.js");
const { ChannelType } = await import("discord.js");

const VN = "Asia/Ho_Chi_Minh";
const HOUR = 60 * 60 * 1000;
const at = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h, min);

test("parseTime accepts times of day and nothing else", () => {
  assert.deepEqual(schedule.parseTime("20:00"), { hour: 20, minute: 0 });
  assert.deepEqual(schedule.parseTime(" 8:05 "), { hour: 8, minute: 5 });
  assert.deepEqual(schedule.parseTime("00:00"), { hour: 0, minute: 0 });
  for (const bad of ["24:00", "7:60", "7", "7pm", "", "20:0", "ab:cd"]) assert.equal(schedule.parseTime(bad), null, bad);
  assert.equal(schedule.formatTime({ hour: 8, minute: 5 }), "08:05");
  assert.equal(schedule.describeSlot({ weekday: 5, hour: 20, minute: 0 }), "Thứ Sáu 20:00");
});

test("next occurrence later the same day", () => {
  // Friday 9 January 2026, 10:00 in Vietnam
  const now = at(2026, 1, 9, 3, 0);
  assert.equal(schedule.nextOccurrence({ weekday: 5, hour: 20, minute: 0 }, now, VN), at(2026, 1, 9, 13, 0));
});

test("next occurrence when today's time has already passed is next week", () => {
  const now = at(2026, 1, 9, 14, 30);
  assert.equal(schedule.nextOccurrence({ weekday: 5, hour: 20, minute: 0 }, now, VN), at(2026, 1, 16, 13, 0));
  const exactly = at(2026, 1, 9, 13, 0);
  assert.equal(schedule.nextOccurrence({ weekday: 5, hour: 20, minute: 0 }, exactly, VN), at(2026, 1, 16, 13, 0), "strictly after now");
});

test("next occurrence across the end of the week", () => {
  // Sunday 11 January 2026, 23:00 in Vietnam
  const now = at(2026, 1, 11, 16, 0);
  assert.equal(schedule.nextOccurrence({ weekday: 1, hour: 8, minute: 0 }, now, VN), at(2026, 1, 12, 1, 0), "Monday morning is next");
  assert.equal(schedule.nextOccurrence({ weekday: 0, hour: 8, minute: 0 }, now, VN), at(2026, 1, 18, 1, 0), "Sunday 08:00 has passed, so next Sunday");
});

test("next occurrence follows the zone, including daylight saving", () => {
  // Los Angeles in winter is 8 hours behind UTC: Friday 20:00 there is Saturday 04:00 UTC
  const winter = at(2026, 1, 9, 10, 0);
  assert.equal(schedule.nextOccurrence({ weekday: 5, hour: 20, minute: 0 }, winter, "America/Los_Angeles"), at(2026, 1, 10, 4, 0));
  // Clocks went forward on 8 March 2026: Sunday 12:00 is 7 hours behind UTC that day
  const beforeChange = at(2026, 3, 6, 0, 0);
  assert.equal(schedule.nextOccurrence({ weekday: 0, hour: 12, minute: 0 }, beforeChange, "America/Los_Angeles"), at(2026, 3, 8, 19, 0));
  // The same wall-clock time a week earlier was 8 hours behind
  assert.equal(schedule.nextOccurrence({ weekday: 0, hour: 12, minute: 0 }, at(2026, 3, 1, 0, 0), "America/Los_Angeles"), at(2026, 3, 1, 20, 0));
});

test("the ready-made templates are valid schedules", () => {
  assert.ok(schedule.TEMPLATES.length >= 3);
  const ids = new Set();
  for (const t of schedule.TEMPLATES) {
    assert.ok(!ids.has(t.id));
    ids.add(t.id);
    assert.ok(t.name.length <= 60 && t.description.length <= 300, t.id);
    assert.ok(t.weekday >= 0 && t.weekday <= 6 && t.hour < 24 && t.minute < 60 && t.duration >= 30, t.id);
    assert.ok(schedule.nextOccurrence(t, Date.now(), VN) > Date.now());
  }
});

// ---- the job, with a fake client

function row(overrides = {}) {
  const base = { guild_id: "gA", name: "Đêm Game", description: "Cày game", weekday: 5, hour: 20, minute: 0, duration_min: 120, channel_id: "voice1", notify_role_id: null, created_at: 0 };
  const r = { ...base, ...overrides };
  const result = getDb()
    .prepare("INSERT INTO recurring_events (guild_id, name, description, weekday, hour, minute, duration_min, channel_id, notify_role_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(r.guild_id, r.name, r.description, r.weekday, r.hour, r.minute, r.duration_min, r.channel_id, r.notify_role_id, r.created_at);
  return Number(result.lastInsertRowid);
}

function fakeGuild(id, { permission = true, channelType = ChannelType.GuildVoice, createFails = false, announceFails = false } = {}) {
  const created = [];
  const sent = [];
  const channel = { id: "voice1", type: channelType };
  return {
    created,
    sent,
    guild: {
      id,
      members: { me: { permissions: { has: (name) => permission && name === "ManageEvents" } } },
      channels: { cache: new Map([["voice1", channel]]) },
      scheduledEvents: {
        create: async (options) => {
          if (createFails) throw new Error("Missing Access");
          created.push(options);
        },
      },
      systemChannel: {
        send: async (payload) => {
          if (announceFails) throw new Error("Missing Permissions");
          sent.push(payload);
        },
      },
    },
  };
}

const clientOf = (...guilds) => ({ guilds: { cache: new Map(guilds.map((g) => [g.guild.id, g.guild])) } });
const stored = (id) => getDb().prepare("SELECT last_event_start FROM recurring_events WHERE id = ?").get(id).last_event_start;
const clear = () => getDb().exec("DELETE FROM recurring_events");

// Friday 9 January 2026, 10:00 in Vietnam: the Friday 20:00 event starts in 10 hours
const NOW = at(2026, 1, 9, 3, 0);
const START = at(2026, 1, 9, 13, 0);

test("the job creates the Discord event once, announces it and never duplicates it", async () => {
  clear();
  const id = row({ notify_role_id: "role9" });
  const g = fakeGuild("gA");
  const client = clientOf(g);

  assert.equal(await runEvents(client, { now: NOW, timeZone: VN }), 1);
  assert.equal(g.created.length, 1);
  const options = g.created[0];
  assert.equal(options.name, "Đêm Game");
  assert.equal(options.scheduledStartTime.getTime(), START);
  assert.equal(options.scheduledEndTime.getTime(), START + 2 * HOUR);
  assert.equal(options.entityType, 2, "a voice channel makes a voice event");
  assert.equal(options.privacyLevel, 2, "guild only");
  assert.equal(stored(id), START);
  assert.equal(g.sent.length, 1);
  assert.match(g.sent[0].content, /<@&role9>/);
  assert.deepEqual(g.sent[0].allowedMentions, { roles: ["role9"] });

  assert.equal(await runEvents(client, { now: NOW + 5 * 60_000, timeZone: VN }), 0, "the next tick creates nothing");
  assert.equal(g.created.length, 1);
  assert.equal(g.sent.length, 1);

  // Once the event has started, the next one is a week away and still outside the 24 hour window
  assert.equal(await runEvents(client, { now: START + HOUR, timeZone: VN }), 0);
  // Six days later it is within a day of the next start and a new event is made
  assert.equal(await runEvents(client, { now: START + 6.5 * 24 * HOUR, timeZone: VN }), 1);
  assert.equal(g.created.length, 2);
});

test("the job waits until the event is less than a day away", async () => {
  clear();
  row();
  const g = fakeGuild("gA");
  assert.equal(await runEvents(clientOf(g), { now: START - 25 * HOUR, timeZone: VN }), 0);
  assert.equal(await runEvents(clientOf(g), { now: START - 23 * HOUR, timeZone: VN }), 1);
});

test("a stage channel makes a stage event", async () => {
  clear();
  row();
  const g = fakeGuild("gA", { channelType: ChannelType.GuildStageVoice });
  await runEvents(clientOf(g), { now: NOW, timeZone: VN });
  assert.equal(g.created[0].entityType, 1);
});

test("the job skips quietly without permission, a channel, or the server, and tries again later", async () => {
  clear();
  const noPerm = row({ guild_id: "gNoPerm" });
  row({ guild_id: "gNoChannel", channel_id: "gone" });
  row({ guild_id: "gAbsent" });
  const a = fakeGuild("gNoPerm", { permission: false });
  const b = fakeGuild("gNoChannel");
  const client = clientOf(a, b);
  assert.equal(await runEvents(client, { now: NOW, timeZone: VN }), 0);
  assert.equal(a.created.length + b.created.length, 0);
  assert.equal(stored(noPerm), null, "nothing is marked as created, so a later tick can still do it");

  // The permission is granted afterwards
  a.guild.members.me.permissions.has = () => true;
  assert.equal(await runEvents(client, { now: NOW + 60_000, timeZone: VN }), 1);
  assert.equal(a.created.length, 1);
});

test("a failing server does not stop the others, and a failed announcement keeps the event", async () => {
  clear();
  const bad = row({ guild_id: "gBad" });
  const noisy = row({ guild_id: "gNoisy" });
  const fine = row({ guild_id: "gFine" });
  const gBad = fakeGuild("gBad", { createFails: true });
  const gNoisy = fakeGuild("gNoisy", { announceFails: true });
  const gFine = fakeGuild("gFine");

  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await runEvents(clientOf(gBad, gNoisy, gFine), { now: NOW, timeZone: VN }), 2);
  } finally {
    console.error = originalError;
  }
  assert.equal(gBad.created.length, 0);
  assert.equal(stored(bad), null, "a failed creation is retried on the next tick");
  assert.equal(gNoisy.created.length, 1);
  assert.equal(stored(noisy), START, "the event exists even though the announcement failed");
  assert.equal(gFine.created.length, 1);
  assert.equal(stored(fine), START);
});

test("the job module is registered for the job runner", async () => {
  const { default: job } = await import("../src/jobs/events.js");
  assert.equal(job.name, "events");
  assert.equal(job.everyMs, 5 * 60 * 1000);
  assert.equal(typeof job.run, "function");
});
