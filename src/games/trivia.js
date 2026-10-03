import { randomBytes } from "node:crypto";
import { QUESTIONS } from "./questions.js";

export const ROUND_TTL_MS = 60 * 1000;
export const WIN_POINTS = 12;
const REMEMBER = 8;
// A finished round stays readable a while so late button presses get a proper answer
const KEEP_MS = 10 * 60 * 1000;

const rounds = new Map();
const activeByGuild = new Map();
const recent = new Map();

export const resetTrivia = () => {
  rounds.clear();
  activeByGuild.clear();
  recent.clear();
};

function prune(now) {
  for (const [id, round] of rounds) if (round.expiresAt + KEEP_MS <= now) rounds.delete(id);
}

export function startTrivia(guildId, { now = Date.now(), random = Math.random, questions = QUESTIONS } = {}) {
  prune(now);
  const activeId = activeByGuild.get(guildId);
  const active = activeId && rounds.get(activeId);
  if (active && !active.closed && active.expiresAt > now) return { started: false, expiresAt: active.expiresAt };

  // Avoid the last few questions of this server so a round never feels like a repeat
  const seen = recent.get(guildId) ?? [];
  let pool = questions.map((_, i) => i).filter((i) => !seen.includes(i));
  if (!pool.length) pool = questions.map((_, i) => i);
  const index = pool[Math.floor(random() * pool.length)];
  recent.set(guildId, [...seen, index].slice(-REMEMBER));

  const id = randomBytes(4).toString("hex");
  const question = questions[index];
  rounds.set(id, { id, guildId, question, expiresAt: now + ROUND_TTL_MS, closed: false, tried: new Set() });
  activeByGuild.set(guildId, id);
  return { started: true, roundId: id, question, expiresAt: now + ROUND_TTL_MS };
}

export function isOpen(roundId, { now = Date.now() } = {}) {
  const round = rounds.get(roundId);
  return Boolean(round && !round.closed && round.expiresAt > now);
}

export function closeRound(roundId) {
  const round = rounds.get(roundId);
  if (round) round.closed = true;
}

// One try per person per round, so nobody wins by pressing all four buttons
export function answerTrivia(roundId, userId, index, { now = Date.now() } = {}) {
  const round = rounds.get(roundId);
  if (!round) return { status: "missing" };
  const base = { question: round.question, correctIndex: round.question.answer };
  if (round.closed) return { ...base, status: "closed" };
  if (round.expiresAt <= now) {
    round.closed = true;
    return { ...base, status: "expired" };
  }
  if (round.tried.has(userId)) return { ...base, status: "tried" };
  round.tried.add(userId);
  if (index !== round.question.answer) return { ...base, status: "wrong" };
  round.closed = true;
  return { ...base, status: "correct", winnerId: userId };
}
