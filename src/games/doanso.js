// Guess the number: one round per server, held in memory, gone after ten minutes or a restart.
export const ROUND_TTL_MS = 10 * 60 * 1000;
export const WIN_POINTS = 15;

const rounds = new Map();

export const resetDoanso = () => rounds.clear();

export function startRound(guildId, { now = Date.now(), random = Math.random } = {}) {
  const current = rounds.get(guildId);
  if (current && current.expiresAt > now) return { started: false, expiresAt: current.expiresAt, attempts: current.attempts };
  const round = { secret: 1 + Math.floor(random() * 100), expiresAt: now + ROUND_TTL_MS, attempts: 0 };
  rounds.set(guildId, round);
  return { started: true, expiresAt: round.expiresAt };
}

export function guess(guildId, number, { now = Date.now() } = {}) {
  const round = rounds.get(guildId);
  if (!round) return { status: "none" };
  if (round.expiresAt <= now) {
    rounds.delete(guildId);
    return { status: "expired", secret: round.secret };
  }
  round.attempts += 1;
  if (number === round.secret) {
    rounds.delete(guildId);
    return { status: "win", attempts: round.attempts };
  }
  return { status: number < round.secret ? "higher" : "lower", attempts: round.attempts };
}
