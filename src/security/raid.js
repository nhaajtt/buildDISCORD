// Pure sliding-window counter for member joins. No Discord, no clock of its own: the caller can inject one.

// Timestamps still inside the window, oldest first
export function inWindow(stamps, now, windowMs) {
  return stamps.filter((t) => now - t < windowMs && t <= now);
}

export function createRaidDetector({ now = Date.now, cooldownMs = 60_000, remember = 1000, maxGuilds = 2000 } = {}) {
  const stamps = new Map();
  const quietUntil = new Map();
  const seen = new Set();

  return {
    // Records one join. `joinId` is the id of Discord's join notice, so the same notice counted twice changes nothing.
    // Trips when `limit` joins fall inside `windowSec`, then stays quiet for the cooldown so one raid is one alert.
    record(guildId, joinId, { limit, windowSec }) {
      if (joinId !== undefined && joinId !== null) {
        if (seen.has(joinId)) return { tripped: false, count: 0, duplicate: true };
        seen.add(joinId);
        if (seen.size > remember) seen.delete(seen.values().next().value);
      }
      const at = now();
      if ((quietUntil.get(guildId) ?? 0) > at) return { tripped: false, count: 0, cooling: true };

      const live = inWindow(stamps.get(guildId) ?? [], at, windowSec * 1000);
      live.push(at);
      if (live.length >= limit) {
        stamps.delete(guildId);
        quietUntil.set(guildId, at + cooldownMs);
        return { tripped: true, count: live.length };
      }
      stamps.set(guildId, live);
      // Servers that went quiet would otherwise stay in the maps forever
      if (stamps.size > maxGuilds) {
        for (const [key, list] of stamps) if (!inWindow(list, at, windowSec * 1000).length) stamps.delete(key);
        for (const [key, until] of quietUntil) if (until <= at) quietUntil.delete(key);
      }
      return { tripped: false, count: live.length };
    },
    reset(guildId) {
      stamps.delete(guildId);
      quietUntil.delete(guildId);
    },
  };
}
