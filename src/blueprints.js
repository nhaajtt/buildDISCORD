import { randomBytes } from "node:crypto";
import { textChannelName } from "./ai/validate.js";

const TTL_MS = 15 * 60 * 1000;
const store = new Map();

// A blueprint is the plan a person is still editing. It lives in memory only and expires after 15 minutes.
export function createBlueprint({ guildId, userId, plan }, now = Date.now()) {
  prune(now);
  const id = randomBytes(4).toString("hex");
  store.set(id, { id, guildId, userId, plan: structuredClone(plan), expiresAt: now + TTL_MS });
  return id;
}

export function getBlueprint(id, now = Date.now()) {
  prune(now);
  return store.get(id) ?? null;
}

export function dropBlueprint(id) {
  store.delete(id);
}

function prune(now) {
  for (const [id, entry] of store) if (entry.expiresAt <= now) store.delete(id);
}

// The first category is the admin area every server needs, so it cannot be removed
export function removeCategory(plan, index) {
  if (!Number.isInteger(index) || index < 1 || index >= plan.categories.length) return false;
  plan.categories.splice(index, 1);
  return true;
}

export function renameCategory(plan, index, name) {
  const next = String(name).replace(/\s+/g, " ").trim().slice(0, 90);
  if (!next || !plan.categories[index]) return false;
  if (plan.categories.some((c, i) => i !== index && c.name === next)) return false;
  plan.categories[index].name = next;
  return true;
}

// New channels go into the first themed category (not the admin, DJ or mod area), or a new category if there is none
export function addChannel(plan, rawName, type) {
  const voice = type === "voice";
  const clean = String(rawName).replace(/\s+/g, " ").trim().slice(0, 90);
  if (!clean) return { ok: false, reason: "empty" };
  const name = voice ? clean : textChannelName(clean);
  if (plan.categories.some((c) => c.channels.some((ch) => ch.name === name))) return { ok: false, reason: "duplicate" };

  let target = plan.categories.find((c, i) => i > 0 && !c.staff && !c.channels.some((ch) => ch.kind === "dj"));
  if (!target) {
    target = { name: "🆕 Khu Mới", channels: [] };
    const insertAt = Math.max(1, plan.categories.findIndex((c) => c.channels.some((ch) => ch.kind === "dj")));
    plan.categories.splice(insertAt, 0, target);
  }
  target.channels.push({ name, type: voice ? "voice" : "text" });
  return { ok: true, category: target.name };
}
