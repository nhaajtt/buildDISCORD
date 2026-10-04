import { lines } from "../humor/reminders.js";

// Pure time logic for /nhacviec: no Discord, no database.

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const MAX_AHEAD_MS = 365 * DAY;
export const FALLBACK_ZONE = "Asia/Ho_Chi_Minh";

export const AFTER_CHOICES = [
  { name: "10 phút", value: 10 },
  { name: "30 phút", value: 30 },
  { name: "1 giờ", value: 60 },
  { name: "3 giờ", value: 180 },
  { name: "1 ngày", value: 1440 },
  { name: "3 ngày", value: 4320 },
  { name: "1 tuần", value: 10080 },
];

const OPTIONS = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" };

function formatter(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...OPTIONS });
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: FALLBACK_ZONE, ...OPTIONS });
  }
}

// Wall clock date and time of an instant in a time zone
export function localParts(ms, timeZone) {
  const out = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, min: out.minute };
}

const offsetAt = (ms, timeZone) => {
  const floored = Math.floor(ms / MINUTE) * MINUTE;
  const p = localParts(floored, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - floored;
};

// The instant at which a wall clock reads y-m-d h:min in a time zone (a daylight saving shift is settled with a second pass)
export function zonedToUtc(y, m, d, h, min, timeZone) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = offsetAt(guess, timeZone);
  let at = guess - first;
  const second = offsetAt(at, timeZone);
  if (second !== first) at = guess - second;
  return at;
}

function checkRange(h, min) {
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return { ok: false, error: lines.clockRange };
  return { ok: true, h, min };
}

// "7:30", "07:30", "21h05", "9h" or "9.30" into { h, min }, or an error line
export function parseClock(text) {
  const raw = String(text ?? "").trim().toLowerCase();
  if (!raw) return { ok: false, error: lines.emptyClock };
  const full = /^(\d{1,2})\s*[:h.]\s*(\d{2})$/.exec(raw);
  if (full) return checkRange(Number(full[1]), Number(full[2]));
  const hourOnly = /^(\d{1,2})\s*h$/.exec(raw);
  if (hourOnly) return checkRange(Number(hourOnly[1]), 0);
  return { ok: false, error: lines.badClock };
}

// Next time the wall clock reads h:min after `now`: today if still ahead, otherwise tomorrow
export function nextClockTime(h, min, now, timeZone) {
  const today = localParts(now, timeZone);
  const todayAt = zonedToUtc(today.y, today.m, today.d, h, min, timeZone);
  if (todayAt > now) return { dueAt: todayAt, tomorrow: false };
  const next = new Date(Date.UTC(today.y, today.m - 1, today.d + 1));
  return { dueAt: zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), h, min, timeZone), tomorrow: true };
}

// The two ways to say when: `after` (minutes, one of AFTER_CHOICES) or `at` ("HH:mm" in the server's zone). Exactly one is needed.
export function parseWhen({ after = null, at = null, now = Date.now(), timeZone = FALLBACK_ZONE } = {}) {
  const hasAfter = after !== null && after !== undefined;
  const hasAt = typeof at === "string" && at.trim() !== "";
  if (hasAfter && hasAt) return { ok: false, error: lines.bothWhen };
  if (!hasAfter && !hasAt) return { ok: false, error: lines.needWhen };
  if (hasAfter) {
    const found = AFTER_CHOICES.find((c) => c.value === after);
    if (!found) return { ok: false, error: lines.badAfter };
    return { ok: true, dueAt: now + found.value * MINUTE, tomorrow: false };
  }
  const clock = parseClock(at);
  if (!clock.ok) return clock;
  const { dueAt, tomorrow } = nextClockTime(clock.h, clock.min, now, timeZone);
  if (dueAt - now > MAX_AHEAD_MS) return { ok: false, error: lines.tooFar };
  return { ok: true, dueAt, tomorrow };
}
