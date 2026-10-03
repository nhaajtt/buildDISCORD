import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { getDb } from "./db.js";

const DAY = 24 * 60 * 60 * 1000;

// What each plan allows. Infinity means no cap.
export const PLANS = {
  free: { label: "Miễn phí", rank: 0, mix: false, humor: false, onboarding: true, audit: true, automodFull: false, tickets: false, buildsTotal: 1, aiPerMonth: 0, backups: 0, customThemes: 0, recurringEvents: 0, games: false, events: false },
  pro: { label: "Pro", rank: 1, mix: true, humor: true, onboarding: true, audit: true, automodFull: true, tickets: true, buildsTotal: Infinity, aiPerMonth: 20, backups: 3, customThemes: 3, recurringEvents: 3, games: true, events: true },
  plus: { label: "Plus", rank: 2, mix: true, humor: true, onboarding: true, audit: true, automodFull: true, tickets: true, buildsTotal: Infinity, aiPerMonth: 100, backups: 10, customThemes: 10, recurringEvents: 10, games: true, events: true },
};

// No 0/O/1/I so a code read out loud or typed from a screenshot is hard to get wrong
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode() {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `THAU-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizeCode(input) {
  return String(input).trim().toUpperCase().replace(/\s+/g, "");
}

export function createLicense(plan, days, now = Date.now()) {
  if (!PLANS[plan] || plan === "free") throw new Error(`Unknown paid plan: ${plan}`);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("days must be a whole number from 1 to 3650");
  const code = makeCode();
  getDb().prepare("INSERT INTO licenses (code, plan, days, created_at) VALUES (?, ?, ?, ?)").run(code, plan, days, now);
  return code;
}

// Active plan of a server: the highest-ranked license that has not expired, else free
// Servers the owner lists in UNLOCKED_GUILD_IDS (their own and their test servers) get everything, with no license and no expiry.
// The limits are lifted far above anything a paid plan has, so new features can be tried without hitting a quota.
const UNLOCKED = { ...PLANS.plus, label: "Mở khoá (chủ bot)", rank: 3, aiPerMonth: 1000, backups: 50, customThemes: 50, recurringEvents: 25 };

export const isUnlocked = (guildId) => config.unlockedGuildIds.includes(String(guildId));

export function getPlan(guildId, now = Date.now()) {
  if (isUnlocked(guildId)) return { plan: "plus", ...UNLOCKED, expiresAt: null, unlocked: true };
  const rows = getDb()
    .prepare("SELECT plan, expires_at FROM licenses WHERE guild_id = ? AND expires_at > ?")
    .all(guildId, now);
  if (!rows.length) return { plan: "free", ...PLANS.free, expiresAt: null };
  const best = rows.reduce((a, b) => (PLANS[b.plan].rank > PLANS[a.plan].rank ? b : a));
  const expiresAt = Math.max(...rows.filter((r) => r.plan === best.plan).map((r) => r.expires_at));
  return { plan: best.plan, ...PLANS[best.plan], expiresAt };
}

// Gives a code to a server. A second code of the same plan adds its days after the current expiry.
export function redeem(code, guildId, now = Date.now()) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM licenses WHERE code = ?").get(normalizeCode(code));
  if (!row) return { ok: false, reason: "unknown" };
  if (row.guild_id) return { ok: false, reason: row.guild_id === guildId ? "mine" : "used" };

  const current = db
    .prepare("SELECT MAX(expires_at) AS e FROM licenses WHERE guild_id = ? AND plan = ? AND expires_at > ?")
    .get(guildId, row.plan, now);
  const start = current?.e ?? now;
  const expiresAt = start + row.days * DAY;
  db.prepare("UPDATE licenses SET guild_id = ?, redeemed_at = ?, expires_at = ? WHERE code = ? AND guild_id IS NULL").run(
    guildId,
    now,
    expiresAt,
    row.code,
  );
  return { ok: true, plan: row.plan, expiresAt };
}

// Direct grant by the owner, no code in between
export function grant(guildId, plan, days, now = Date.now()) {
  const code = createLicense(plan, days, now);
  return redeem(code, guildId, now);
}

export function revoke(guildId, now = Date.now()) {
  return Number(
    getDb().prepare("UPDATE licenses SET expires_at = ? WHERE guild_id = ? AND expires_at > ?").run(now, guildId, now).changes,
  );
}

const monthKey = (now) => new Date(now).toISOString().slice(0, 7);

export function getUsage(guildId, feature, { lifetime = false, now = Date.now() } = {}) {
  const month = lifetime ? "all" : monthKey(now);
  const row = getDb()
    .prepare("SELECT count FROM usage WHERE guild_id = ? AND month = ? AND feature = ?")
    .get(guildId, month, feature);
  return row?.count ?? 0;
}

export function addUsage(guildId, feature, { lifetime = false, now = Date.now(), amount = 1 } = {}) {
  const month = lifetime ? "all" : monthKey(now);
  getDb()
    .prepare(
      "INSERT INTO usage (guild_id, month, feature, count) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, month, feature) DO UPDATE SET count = count + excluded.count",
    )
    .run(guildId, month, feature, amount);
}

export function listLicenses() {
  return getDb().prepare("SELECT * FROM licenses ORDER BY created_at DESC").all();
}

export function planCounts(guildIds, now = Date.now()) {
  const counts = { free: 0, pro: 0, plus: 0 };
  for (const id of guildIds) counts[getPlan(id, now).plan] += 1;
  return counts;
}
