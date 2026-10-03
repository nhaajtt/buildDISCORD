// Weekly recurring events, computed in the time zone people use. Plain Intl, no date library: the zone's offset is read from
// the formatter at the instant in question, which also handles daylight saving.

export const WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function partsAt(ms, timeZone) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  });
  const out = {};
  for (const part of format.formatToParts(ms)) out[part.type] = part.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: SHORT.indexOf(out.weekday),
  };
}

// How far the zone is ahead of UTC at this instant, in milliseconds
function offsetAt(ms, timeZone) {
  const p = partsAt(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// A wall-clock time in the zone to a UTC timestamp. The offset is found twice because the first guess can land on the other side of a clock change.
export function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - offsetAt(naive, timeZone);
  return naive - offsetAt(first, timeZone);
}

// The next start of a weekly event strictly after `now`. weekday is 0 for Sunday to 6 for Saturday, like JavaScript.
export function nextOccurrence({ weekday, hour, minute }, now, timeZone) {
  const today = partsAt(now, timeZone);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
    if (date.getUTCDay() !== weekday) continue;
    const start = zonedToUtc(
      { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour, minute },
      timeZone,
    );
    if (start > now) return start;
  }
  throw new Error("invalid weekday");
}

// "20:00" or "8:05" to { hour, minute }, or null when it is not a time of day
export function parseTime(text) {
  const match = String(text).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export const formatTime = ({ hour, minute }) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

export const describeSlot = (def) => `${WEEKDAYS[def.weekday]} ${formatTime(def)}`;

export const TEMPLATES = [
  { id: "game-night", name: "Đêm Game Thứ Sáu", weekday: 5, hour: 20, minute: 0, duration: 180, description: "Tối thứ Sáu cày game cùng hội. Ai thua thì pha cà phê." },
  { id: "study-night", name: "Đêm Học Nhóm Chủ Nhật", weekday: 0, hour: 20, minute: 0, duration: 120, description: "Học chung cho đỡ buồn, deadline sáng mai không chờ ai." },
  { id: "movie-night", name: "Đêm Xem Phim Thứ Bảy", weekday: 6, hour: 21, minute: 0, duration: 150, description: "Cả hội xem chung một bộ phim. Cấm spoil, cấm ngủ gật." },
  { id: "chill-talk", name: "Chill Tám Chuyện Thứ Tư", weekday: 3, hour: 21, minute: 0, duration: 90, description: "Giữa tuần cần tám chuyện cho đỡ mệt. Chủ đề do cả hội chọn." },
];
