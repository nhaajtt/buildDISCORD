import { getDb } from "../db.js";
import { config } from "../config.js";
import { dayKey } from "../games/points.js";
import { getSection } from "../settings.js";
import { getPlan } from "../license.js";
import { levelForXp } from "./level.js";

// Activity xp for messages and voice time. Everything the hot path needs lives in memory: the per-server settings (30 second
// cache), a per-person entry with cooldown and daily total, and pending increments that are written in one transaction every
// few seconds. A message that earns nothing never touches the database after the person's entry is loaded.

const SETTINGS_TTL = 30_000;
const FLUSH_EVERY = 15_000;
const IDLE_EVICT = 5 * 60_000;
const MAX_VOICE_MINUTES = 24 * 60;

const settingsCache = new Map();

// The server's activity settings, and whether xp is really on (switched on and included in the plan)
export function activityConfig(guildId, now = Date.now()) {
  const hit = settingsCache.get(guildId);
  if (hit && now >= hit.at && now - hit.at < SETTINGS_TTL) return hit.value;
  const settings = getSection(guildId, "activity");
  const value = { settings, active: settings.enabled && Boolean(getPlan(guildId, now).activity) };
  if (settingsCache.size > 2000) settingsCache.clear();
  settingsCache.set(guildId, { at: now, value });
  return value;
}

export function clearActivityCache(guildId) {
  if (guildId) settingsCache.delete(guildId);
  else settingsCache.clear();
}

const entries = new Map();
const dirty = new Set();
let timer = null;
let exitHooked = false;

const keyOf = (guildId, userId) => `${guildId}:${userId}`;

function load(guildId, userId) {
  const key = keyOf(guildId, userId);
  let entry = entries.get(key);
  if (!entry) {
    const row = getDb().prepare("SELECT xp, msgs, voice_min, day, day_xp, last_msg_at FROM xp WHERE guild_id = ? AND user_id = ?").get(guildId, userId);
    entry = {
      guildId,
      userId,
      xp: row?.xp ?? 0,
      msgs: row?.msgs ?? 0,
      voiceMin: row?.voice_min ?? 0,
      day: row?.day ?? null,
      dayXp: row?.day_xp ?? 0,
      lastMsgAt: row?.last_msg_at ?? 0,
      pending: { xp: 0, msgs: 0, voice: 0 },
      touched: 0,
    };
    entries.set(key, entry);
  }
  entry.touched = Date.now();
  return entry;
}

function markDirty(entry) {
  dirty.add(keyOf(entry.guildId, entry.userId));
  if (!timer) {
    timer = setInterval(() => {
      try {
        flushXp();
      } catch (error) {
        console.error("Could not save activity xp:", error.message);
      }
    }, FLUSH_EVERY);
    timer.unref();
  }
  if (!exitHooked) {
    exitHooked = true;
    process.on("exit", () => {
      try {
        flushXp();
      } catch {
        // nothing more can be done while exiting
      }
    });
  }
  if (dirty.size >= 500) flushXp();
}

// Writes the pending increments. Increments (not totals) are added, so data that was deleted meanwhile is not brought back.
export function flushXp() {
  if (dirty.size) {
    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO xp (guild_id, user_id, xp, msgs, voice_min, day, day_xp, last_msg_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp, msgs = msgs + excluded.msgs, voice_min = voice_min + excluded.voice_min,
         day = excluded.day, day_xp = excluded.day_xp, last_msg_at = excluded.last_msg_at`,
    );
    const keys = [...dirty];
    db.exec("BEGIN");
    try {
      for (const key of keys) {
        const e = entries.get(key);
        if (!e) continue;
        stmt.run(e.guildId, e.userId, e.pending.xp, e.pending.msgs, e.pending.voice, e.day, e.dayXp, e.lastMsgAt);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    for (const key of keys) {
      const e = entries.get(key);
      if (e) e.pending = { xp: 0, msgs: 0, voice: 0 };
      dirty.delete(key);
    }
  }
  // Forget people who have been quiet for a while, so memory stays small on a small machine
  if (entries.size > 2000) {
    const cutoff = Date.now() - IDLE_EVICT;
    for (const [key, e] of entries) if (!dirty.has(key) && e.touched < cutoff) entries.delete(key);
  }
}

// Forgets what is held in memory about one server (unwritten increments, cooldowns, cached settings) without writing it.
// Used when the server's data is purged, so nothing is written back afterwards.
export function forgetGuildXp(guildId) {
  settingsCache.delete(guildId);
  for (const [key, entry] of entries) {
    if (entry.guildId !== guildId) continue;
    entries.delete(key);
    dirty.delete(key);
  }
}

// For tests: forget everything held in memory without writing it
export function resetXpCache() {
  entries.clear();
  dirty.clear();
  settingsCache.clear();
}

function rollDay(entry, now) {
  const key = dayKey(now, config.timezone);
  if (entry.day !== key) {
    entry.day = key;
    entry.dayXp = 0;
  }
}

function apply(entry, amount, counter, by) {
  const before = entry.xp;
  entry.xp += amount;
  entry.dayXp += amount;
  entry.pending.xp += amount;
  entry[counter.name] += by;
  entry.pending[counter.pending] += by;
  markDirty(entry);
  return { levelBefore: levelForXp(before), levelAfter: levelForXp(entry.xp), before, after: entry.xp };
}

// One message by one person. Returns { granted: 0, reason } when nothing was earned.
export function grantMessageXp(guildId, userId, settings, { now = Date.now() } = {}) {
  const entry = load(guildId, userId);
  if (now - entry.lastMsgAt < settings.cooldownSec * 1000) return { granted: 0, reason: "cooldown" };
  rollDay(entry, now);
  const room = settings.dailyCap - entry.dayXp;
  entry.lastMsgAt = now;
  if (room <= 0) return { granted: 0, reason: "cap" };
  const granted = Math.min(settings.xpPerMessage, room);
  return { granted, reason: null, ...apply(entry, granted, { name: "msgs", pending: "msgs" }, 1) };
}

// Whole minutes spent in voice. The minutes are always counted, the xp is limited by the same daily cap as messages.
export function grantVoiceXp(guildId, userId, minutes, settings, { now = Date.now() } = {}) {
  const whole = Math.min(MAX_VOICE_MINUTES, Math.max(0, Math.floor(Number(minutes) || 0)));
  if (!whole) return { granted: 0, reason: "none" };
  const entry = load(guildId, userId);
  rollDay(entry, now);
  const room = Math.max(0, settings.dailyCap - entry.dayXp);
  const granted = Math.min(whole * settings.voiceXpPerMin, room);
  return { granted, minutes: whole, reason: granted ? null : "cap", ...apply(entry, granted, { name: "voiceMin", pending: "voice" }, whole) };
}

export function getStats(guildId, userId) {
  flushXp();
  const row = getDb().prepare("SELECT xp, msgs, voice_min FROM xp WHERE guild_id = ? AND user_id = ?").get(guildId, userId);
  return { xp: row?.xp ?? 0, msgs: row?.msgs ?? 0, voiceMin: row?.voice_min ?? 0 };
}

// 1 for the person with the most xp. Null for someone with none, who is not on the board.
export function rankOf(guildId, userId) {
  const { xp } = getStats(guildId, userId);
  if (xp <= 0) return null;
  const ahead = getDb().prepare("SELECT COUNT(*) AS n FROM xp WHERE guild_id = ? AND xp > ?").get(guildId, xp).n;
  return Number(ahead) + 1;
}

export function xpLeaderboard(guildId, limit = 10) {
  flushXp();
  return getDb()
    .prepare("SELECT user_id AS userId, xp, msgs, voice_min AS voiceMin FROM xp WHERE guild_id = ? AND xp > 0 ORDER BY xp DESC, user_id ASC LIMIT ?")
    .all(guildId, Math.min(25, Math.max(1, limit)));
}
