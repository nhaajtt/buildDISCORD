// Level curve for activity xp. Gentle on purpose: a level costs 15 * n^2 + 60 * n xp in total, so level 5 is 675 xp,
// level 10 is 2100 xp and level 25 is 10875 xp. Pure, no database.

export const MAX_LEVEL = 200;

const A = 15;
const B = 60;

// Total xp needed to reach level n (level 0 needs nothing)
export function xpForLevel(level) {
  const n = Math.min(MAX_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));
  return A * n * n + B * n;
}

// The level a total xp amount belongs to
export function levelForXp(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let n = Math.floor((-B + Math.sqrt(B * B + 4 * A * total)) / (2 * A));
  n = Math.min(MAX_LEVEL, Math.max(0, n));
  // Guard the float edge: step so that xpForLevel(n) <= total < xpForLevel(n + 1)
  while (n < MAX_LEVEL && xpForLevel(n + 1) <= total) n += 1;
  while (n > 0 && xpForLevel(n) > total) n -= 1;
  return n;
}

// Where a person stands inside their current level
export function progressFor(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelForXp(total);
  const floor = xpForLevel(level);
  if (level >= MAX_LEVEL) return { level, xp: total, into: total - floor, needed: 0, fraction: 1, nextAt: null };
  const nextAt = xpForLevel(level + 1);
  const needed = nextAt - floor;
  const into = total - floor;
  return { level, xp: total, into, needed, fraction: needed ? into / needed : 1, nextAt };
}

export function progressBar(fraction, width = 12) {
  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  const filled = Math.round(f * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

// The check-in level roles (src/games/levelroles.js) have six tiers; this maps an activity level onto one of them
export const TIER_LEVELS = [0, 5, 10, 20, 35, 50];

export function tierForLevel(level) {
  let tier = 0;
  TIER_LEVELS.forEach((min, i) => {
    if (level >= min) tier = i;
  });
  return tier;
}
