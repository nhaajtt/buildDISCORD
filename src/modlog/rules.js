// Pure rules for moderation commands: who may be acted on, and how input is cleaned.

export const MAX_REASON = 300;
export const TIMEOUT_SECONDS = [60, 300, 3600, 86400, 604800];

// Trimmed reason, or null when it is blank. Longer than the cap is cut, never passed on whole.
export function cleanReason(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.replace(/\r/g, "").trim().slice(0, MAX_REASON);
  return value || null;
}

// A timeout length from the fixed list, or null for anything else
export const timeoutSeconds = (value) => (TIMEOUT_SECONDS.includes(Number(value)) ? Number(value) : null);

// 0 to 7 days of messages to remove with a ban, as seconds
export function banDeleteSeconds(days) {
  const n = Number(days);
  return Number.isInteger(n) && n >= 0 && n <= 7 ? n * 86400 : 0;
}

// Returns null when the action may go ahead, or the key of the refusal line.
// `targetHighest` is null when the person is not in the server (only a ban by id is possible then).
export function checkTarget({ actorId, targetId, botId, ownerId, actorHighest, targetHighest, botHighest, targetIsAdmin = false, action }) {
  if (targetId === actorId) return "self";
  if (targetId === botId) return "bot";
  if (targetId === ownerId) return "owner";
  if (targetHighest === null || targetHighest === undefined) return null;
  if (actorId !== ownerId && targetHighest >= actorHighest) return "aboveYou";
  if (targetHighest >= botHighest) return "aboveBot";
  if (action === "timeout" && targetIsAdmin) return "admin";
  return null;
}
