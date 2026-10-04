import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "purge-test-"));

const { getDb } = await import("../src/db.js");
const { purgeGuildData } = await import("../src/purge.js");
const { grant, getPlan, addUsage, getUsage } = await import("../src/license.js");
const { track, funnel } = await import("../src/analytics.js");

const count = (table, guild) => Number(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE guild_id = ?`).get(guild).n);

function fill(guild) {
  const db = getDb();
  db.prepare("INSERT INTO xp (guild_id, user_id, xp) VALUES (?, 'u1', 50)").run(guild);
  db.prepare("INSERT INTO mod_cases (guild_id, user_id, mod_id, action, at) VALUES (?, 'u1', 'm1', 'warn', 1)").run(guild);
  db.prepare("INSERT INTO role_menus (guild_id, channel_id, title, mode, roles, created_at) VALUES (?, 'c', 't', 'multi', '[]', 1)").run(guild);
  const g = db.prepare("INSERT INTO giveaways (guild_id, channel_id, host_id, prize, ends_at, status, created_at) VALUES (?, 'c', 'h', 'p', 1, 'open', 1)").run(guild);
  db.prepare("INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES (?, 'u1')").run(g.lastInsertRowid);
  db.prepare("INSERT INTO temp_voice (channel_id, guild_id, owner_id, created_at) VALUES (?, ?, 'u1', 1)").run(`tv-${guild}`, guild);
  db.prepare("INSERT INTO scheduled_messages (guild_id, channel_id, body, hhmm, next_at, status, created_by, created_at) VALUES (?, 'c', 'b', '09:00', 1, 'active', 'u', 1)").run(guild);
  db.prepare("INSERT INTO reminders (guild_id, user_id, body, due_at, status, created_at) VALUES (?, 'u1', 'b', 1, 'pending', 1)").run(guild);
  const sg = db.prepare("INSERT INTO suggestions (guild_id, channel_id, user_id, body, status, created_at) VALUES (?, 'c', 'u1', 'b', 'open', 1)").run(guild);
  db.prepare("INSERT INTO suggestion_votes (suggestion_id, user_id, value) VALUES (?, 'u1', 1)").run(sg.lastInsertRowid);
  const p = db.prepare("INSERT INTO polls (guild_id, channel_id, question, options, status, created_by, created_at) VALUES (?, 'c', 'q', '[]', 'open', 'u', 1)").run(guild);
  db.prepare("INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, 'u1', 0)").run(p.lastInsertRowid);
}

test("purging a server erases its members' data and leaves other servers, billing and the funnel alone", () => {
  fill("g-purge-1");
  fill("g-purge-2");
  grant("g-purge-1", "pro", 30);
  addUsage("g-purge-1", "build", { lifetime: true });
  track("g-purge-1", "invite");

  const removed = purgeGuildData("g-purge-1");
  assert.equal(removed.xp, 1);
  for (const table of ["xp", "mod_cases", "role_menus", "giveaways", "polls", "temp_voice", "scheduled_messages", "reminders", "suggestions"]) assert.equal(count(table, "g-purge-1"), 0, table);
  assert.equal(Number(getDb().prepare("SELECT COUNT(*) AS n FROM giveaway_entries").get().n), 1, "only the other server's entry is left");
  assert.equal(Number(getDb().prepare("SELECT COUNT(*) AS n FROM poll_votes").get().n), 1);
  assert.equal(Number(getDb().prepare("SELECT COUNT(*) AS n FROM suggestion_votes").get().n), 1);

  for (const table of ["xp", "mod_cases", "role_menus", "giveaways", "polls", "temp_voice", "scheduled_messages", "reminders", "suggestions"]) assert.equal(count(table, "g-purge-2"), 1, `${table} of the other server`);
  assert.equal(getPlan("g-purge-1").plan, "pro", "the paid plan is kept");
  assert.equal(getUsage("g-purge-1", "build", { lifetime: true }), 1);
  assert.equal(funnel().invite.servers >= 1, true);
});
