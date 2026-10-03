import { randomBytes } from "node:crypto";

export const MOVES = ["keo", "bua", "bao"];
export const DUEL_TTL_MS = 2 * 60 * 1000;
export const WIN_POINTS = 10;
export const TIE_POINTS = 2;

const beats = { keo: "bao", bua: "keo", bao: "bua" };

// "a" or "b" for the winner, "tie" otherwise
export function rps(a, b) {
  if (a === b) return "tie";
  return beats[a] === b ? "a" : "b";
}

const duels = new Map();

export const resetDuels = () => duels.clear();

function prune(now) {
  for (const [id, duel] of duels) if (duel.expiresAt <= now) duels.delete(id);
}

export function createDuel({ guildId, challengerId, targetId }, { now = Date.now() } = {}) {
  prune(now);
  const id = randomBytes(4).toString("hex");
  duels.set(id, { id, guildId, challengerId, targetId, moves: {}, expiresAt: now + DUEL_TTL_MS });
  return id;
}

export function isPending(id, { now = Date.now() } = {}) {
  const duel = duels.get(id);
  return Boolean(duel && duel.expiresAt > now);
}

export function cancelDuel(id) {
  duels.delete(id);
}

// A person presses a move. Only the two duellists count, each chooses once, and the duel ends when both have chosen.
export function chooseMove(id, userId, move, { now = Date.now() } = {}) {
  const duel = duels.get(id);
  if (!duel) return { status: "missing" };
  if (duel.expiresAt <= now) {
    duels.delete(id);
    return { status: "expired" };
  }
  if (userId !== duel.challengerId && userId !== duel.targetId) return { status: "stranger" };
  if (!MOVES.includes(move)) return { status: "invalid" };
  if (duel.moves[userId]) return { status: "locked", move: duel.moves[userId] };

  duel.moves[userId] = move;
  const a = duel.moves[duel.challengerId];
  const b = duel.moves[duel.targetId];
  if (!a || !b) return { status: "waiting", move };

  duels.delete(id);
  const outcome = rps(a, b);
  return {
    status: "done",
    tie: outcome === "tie",
    challengerId: duel.challengerId,
    targetId: duel.targetId,
    moves: { challenger: a, target: b },
    winnerId: outcome === "a" ? duel.challengerId : outcome === "b" ? duel.targetId : null,
    loserId: outcome === "a" ? duel.targetId : outcome === "b" ? duel.challengerId : null,
  };
}
