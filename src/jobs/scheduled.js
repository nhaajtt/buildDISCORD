import { PermissionFlagsBits as P } from "discord.js";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { getPlan } from "../license.js";
import { zonedToUtc, nextOccurrence, parseTime } from "../games/schedule.js";

export const MAX_BODY = 1500;
// An occurrence missed by more than this (the bot was down for long) is skipped rather than posted late
export const MAX_LATE_MS = 12 * 60 * 60 * 1000;
const PER_TICK = 25;
const DUE_SCAN = 200;
const FORGET_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const UNKNOWN_CHANNEL = 10003;

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

// The body of a scheduled message: a typed "\n" becomes a line break (a slash command cannot take a real one), control and
// direction-override characters go, runs of blank lines shrink, and it is capped.
export function cleanBody(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(BAD, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

function dateIn(ms, timeZone) {
  const out = {};
  for (const part of new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(ms)) out[part.type] = Number(part.value);
  return out;
}

// The next time this message is due strictly after `now`: weekly when weekday is 0 to 6, daily when it is null. Wall-clock time in the zone.
export function nextAfter({ weekday = null, hhmm }, now, timeZone = config.timezone) {
  const time = parseTime(hhmm);
  if (!time) throw new Error("invalid time");
  if (weekday !== null && weekday !== undefined) return nextOccurrence({ weekday, ...time }, now, timeZone);
  const today = dateIn(now, timeZone);
  for (let ahead = 0; ahead <= 2; ahead++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
    const start = zonedToUtc({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), ...time }, timeZone);
    if (start > now) return start;
  }
  throw new Error("no next occurrence");
}

// What to do with a row at `now`. At most one occurrence is posted per run: the one that came due, and only when it is not stale.
// Anything older that was missed is dropped, and the next due time is always after now.
export function decide(row, now, timeZone = config.timezone) {
  if (row.next_at > now) return { due: false };
  return { due: true, send: now - row.next_at <= MAX_LATE_MS, nextAt: nextAfter({ weekday: row.weekday, hhmm: row.hhmm }, now, timeZone) };
}

export function createScheduled({ guildId, channelId, body, weekday = null, hhmm, createdBy, now = Date.now(), timeZone = config.timezone }) {
  const nextAt = nextAfter({ weekday, hhmm }, now, timeZone);
  const info = getDb()
    .prepare("INSERT INTO scheduled_messages (guild_id, channel_id, body, weekday, hhmm, next_at, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)")
    .run(guildId, channelId, body, weekday, hhmm, nextAt, createdBy, now);
  return { id: Number(info.lastInsertRowid), nextAt };
}

export const listScheduled = (guildId, limit = 25) => getDb().prepare("SELECT * FROM scheduled_messages WHERE guild_id = ? ORDER BY id LIMIT ?").all(guildId, limit);

export const getScheduled = (guildId, id) => getDb().prepare("SELECT * FROM scheduled_messages WHERE guild_id = ? AND id = ?").get(guildId, id) ?? null;

export const countScheduled = (guildId) => Number(getDb().prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE guild_id = ?").get(guildId).n);

export const removeScheduled = (guildId, id) => Number(getDb().prepare("DELETE FROM scheduled_messages WHERE guild_id = ? AND id = ?").run(guildId, id).changes) > 0;

// Writes the next due time BEFORE anything is posted. Only one caller can win a given occurrence, so a crash after this point
// loses that occurrence at worst and never posts it twice.
function claim(row, nextAt) {
  return Number(getDb().prepare("UPDATE scheduled_messages SET next_at = ? WHERE id = ? AND next_at = ? AND status = 'active'").run(nextAt, row.id, row.next_at).changes) === 1;
}

async function findChannel(guild, channelId) {
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  try {
    return (await guild.channels.fetch(channelId)) ?? null;
  } catch (error) {
    return error?.code === UNKNOWN_CHANNEL ? null : undefined;
  }
}

// The ids of a server's rows its plan covers, oldest first. A lapsed plan covers none, and its rows wait untouched.
function coveredIds(guildId, cache) {
  if (!cache.has(guildId)) {
    const limit = getPlan(guildId).scheduledMessages ?? 0;
    const rows = limit > 0 ? getDb().prepare("SELECT id FROM scheduled_messages WHERE guild_id = ? ORDER BY id LIMIT ?").all(guildId, limit) : [];
    cache.set(guildId, new Set(rows.map((r) => r.id)));
  }
  return cache.get(guildId);
}

export async function runScheduled(client, { now = Date.now(), timeZone = config.timezone } = {}) {
  const rows = getDb().prepare("SELECT * FROM scheduled_messages WHERE status = 'active' AND next_at <= ? ORDER BY next_at LIMIT ?").all(now, DUE_SCAN);
  const covered = new Map();
  let sent = 0;
  let handled = 0;

  for (const row of rows) {
    if (handled >= PER_TICK) break;
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) {
        // The bot may simply not have loaded the server yet; one it left for good is forgotten after a month
        if (now - row.next_at > FORGET_AFTER_MS) removeScheduled(row.guild_id, row.id);
        continue;
      }
      if (guild.available === false || !coveredIds(row.guild_id, covered).has(row.id)) continue;

      const plan = decide(row, now, timeZone);
      if (!plan.due) continue;
      let channel = null;
      if (plan.send) {
        channel = await findChannel(guild, row.channel_id);
        if (channel === undefined) continue;
        if (channel === null) {
          getDb().prepare("UPDATE scheduled_messages SET status = 'broken' WHERE id = ?").run(row.id);
          continue;
        }
        const mine = channel.permissionsFor?.(guild.members?.me);
        // Without the right to post nothing is claimed, so it is tried again until it is stale or the admin fixes the channel
        if (!mine || !mine.has(P.ViewChannel) || !mine.has(P.SendMessages)) continue;
      }
      if (!claim(row, plan.nextAt)) continue;
      handled += 1;
      if (!plan.send) continue;

      // No mention can ping, whatever the text says
      await channel.send({ content: row.body, allowedMentions: { parse: [] } });
      getDb().prepare("UPDATE scheduled_messages SET last_sent_at = ? WHERE id = ?").run(now, row.id);
      sent += 1;
    } catch (error) {
      console.error(`Scheduled message ${row.id} failed:`, error.message);
    }
  }
  return sent;
}

export default {
  name: "scheduled",
  everyMs: 30_000,
  run: (client) => runScheduled(client),
};
