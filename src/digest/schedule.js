// Pure scheduling for the weekly report. No Discord, no database: the caller passes the settings and the clock.

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
// A report that was due but missed (the bot was down) is still sent for this long, after that it waits for next week
export const CATCH_UP_HOURS = 24;

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partsOf(ms, timeZone) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
}

// Weekday (0 is Sunday), hour and minute of an instant in a time zone. An unknown zone falls back to UTC.
export function localParts(ms, timeZone) {
  let parts;
  try {
    parts = partsOf(ms, timeZone);
  } catch {
    parts = partsOf(ms, "UTC");
  }
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { weekday: WEEKDAYS[get("weekday")] ?? 0, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

// The most recent moment at or before `now` when the local clock read weekday:hour:00, and how many whole hours ago that was
export function lastSlot(now, { weekday, hour }, timeZone) {
  const p = localParts(now, timeZone);
  let hoursSince = ((p.weekday - weekday + 7) % 7) * 24 + (p.hour - hour);
  if (hoursSince < 0) hoursSince += 7 * 24;
  const start = now - hoursSince * HOUR - p.minute * 60_000 - (now % 60_000);
  return { start, hoursSince };
}

// True when the report is switched on, has somewhere to go, the slot of this week has arrived and nothing was sent since that slot
export function isDue(settings, now, timeZone) {
  if (!settings?.enabled || !settings.channelId) return false;
  const slot = lastSlot(now, settings, timeZone);
  if (slot.hoursSince >= CATCH_UP_HOURS) return false;
  return settings.lastSentAt < slot.start;
}

// The health check runs about once a week per server, counted from the last one
export const auditDue = (settings, now) => Boolean(settings?.enabled && settings.auditWeekly && now - settings.lastAuditAt >= WEEK - HOUR);

// A score that fell by `threshold` or more since the previous check. Missing history never raises an alert.
export const droppedBy = (before, after, threshold = 10) => Number.isInteger(before) && Number.isInteger(after) && before - after >= threshold;
