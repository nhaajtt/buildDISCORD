import { getDb } from "../db.js";
import { config } from "../config.js";

export const LEVELS = [
  { min: 0, name: "Tân Binh Ngơ Ngác", color: 0x95a5a6 },
  { min: 50, name: "Lính Mới Có Tiếng", color: 0x2ecc71 },
  { min: 150, name: "Cựu Chiến Binh Cãi Nhau", color: 0x3498db },
  { min: 350, name: "Đại Ca Của Hội", color: 0x9b59b6 },
  { min: 700, name: "Huyền Thoại Server", color: 0xf1c40f },
  { min: 1200, name: "Thần Thoại Sống", color: 0xe74c3c },
];

export function levelFor(points) {
  let index = 0;
  LEVELS.forEach((level, i) => {
    if (points >= level.min) index = i;
  });
  return { index, ...LEVELS[index], next: LEVELS[index + 1]?.min ?? null };
}

export const CHECKIN_POINTS = 10;
export const STREAK_STEP = 2;
export const STREAK_BONUS_CAP = 20;
export const GAME_POINTS_PER_DAY = 100;

// The calendar day in the given zone as YYYY-MM-DD. A day is the person's day, not UTC's, so a check-in at 00:30 in Vietnam counts as a new day.
export function dayKey(now, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function previousDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

// What a check-in does, from the last check-in day and the streak so far. Pure, so the day rules can be tested without a database.
export function checkinResult({ lastCheckin, streak }, today) {
  if (lastCheckin === today) return { status: "already", streak };
  const nextStreak = lastCheckin === previousDay(today) ? streak + 1 : 1;
  const bonus = Math.min(STREAK_BONUS_CAP, (nextStreak - 1) * STREAK_STEP);
  return { status: "ok", streak: nextStreak, bonus, points: CHECKIN_POINTS + bonus };
}

export function getScore(guildId, userId) {
  const row = getDb().prepare("SELECT points, streak, last_checkin FROM scores WHERE guild_id = ? AND user_id = ?").get(guildId, userId);
  return row ? { points: row.points, streak: row.streak, lastCheckin: row.last_checkin } : { points: 0, streak: 0, lastCheckin: null };
}

export function addPoints(guildId, userId, amount, { now = Date.now() } = {}) {
  const before = getScore(guildId, userId).points;
  getDb()
    .prepare(
      "INSERT INTO scores (guild_id, user_id, points, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + excluded.points, updated_at = excluded.updated_at",
    )
    .run(guildId, userId, amount, now);
  return { before, after: before + amount };
}

export function checkIn(guildId, userId, { now = Date.now(), timeZone = config.timezone } = {}) {
  const score = getScore(guildId, userId);
  const result = checkinResult(score, dayKey(now, timeZone));
  if (result.status === "already") return { ...result, before: score.points, after: score.points };
  getDb()
    .prepare(
      `INSERT INTO scores (guild_id, user_id, points, streak, last_checkin, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + excluded.points, streak = excluded.streak, last_checkin = excluded.last_checkin, updated_at = excluded.updated_at`,
    )
    .run(guildId, userId, result.points, result.streak, dayKey(now, timeZone), now);
  return { ...result, before: score.points, after: score.points + result.points };
}

export function leaderboard(guildId, limit = 10) {
  return getDb()
    .prepare("SELECT user_id AS userId, points, streak FROM scores WHERE guild_id = ? AND points > 0 ORDER BY points DESC, updated_at ASC LIMIT ?")
    .all(guildId, limit);
}

// Points from games are capped at 100 per person per local day so nobody farms the board by playing all night.
// The count lives in memory only: a restart gives everyone a fresh allowance, which is acceptable for a fun-points cap.
const gameDay = new Map();

export const resetGameCaps = () => gameDay.clear();

export function awardGamePoints(guildId, userId, amount, { now = Date.now(), timeZone = config.timezone } = {}) {
  const today = dayKey(now, timeZone);
  if (gameDay.size > 10_000) for (const [key, entry] of gameDay) if (entry.day !== today) gameDay.delete(key);

  const key = `${guildId}:${userId}`;
  let entry = gameDay.get(key);
  if (!entry || entry.day !== today) entry = { day: today, total: 0 };
  const granted = Math.max(0, Math.min(amount, GAME_POINTS_PER_DAY - entry.total));
  entry.total += granted;
  gameDay.set(key, entry);

  if (!granted) {
    const score = getScore(guildId, userId).points;
    return { granted: 0, capped: true, before: score, after: score };
  }
  return { granted, capped: granted < amount, ...addPoints(guildId, userId, granted, { now }) };
}
