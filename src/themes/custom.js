import { getDb } from "../db.js";
import { DesignError, clean, parseColor, textChannelName } from "../ai/validate.js";
import { gateLimit } from "../utils/gate.js";
import { baseRoles, baseRules, djCategory, infoCategory, staffCategory } from "./base.js";
import { composePlan } from "./index.js";

// A saved theme is the part of a blueprint that is yours: your categories, channels, roles, extra rules and welcome. The shared parts (admin area,
// DJ rooms, mod area, base roles and rules) are added back by composePlan when the theme is used, so a saved theme can never replace them.

export const NAME_MAX = 40;
export const FILE_MAX_BYTES = 100 * 1024;

const CAPS = { categories: 25, channelsPerCategory: 50, channelsTotal: 300, roles: 40, rules: 30, name: 90, topic: 300, rule: 300, welcome: 300 };
const FILE_KIND = "thau-theme";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function colorOf(value, index) {
  if (Number.isInteger(value) && value > 0 && value <= 0xffffff) return value;
  return parseColor(value, index);
}

// Strict rebuild of a theme from anything: the database, an imported file, or an edited blueprint. Unknown fields are dropped. Permissions are never
// copied and a role is self-assignable only when it said so explicitly. Throws DesignError when nothing usable remains.
export function sanitizeCustomTheme(raw) {
  if (!isObject(raw)) throw new DesignError("not an object");

  const roles = [];
  const roleNames = new Set();
  for (const role of Array.isArray(raw.roles) ? raw.roles.slice(0, CAPS.roles * 2) : []) {
    if (roles.length >= CAPS.roles) break;
    const name = clean(role?.name, CAPS.name);
    if (!name || roleNames.has(name)) continue;
    roleNames.add(name);
    roles.push({ key: `cu-${roles.length}`, name, color: colorOf(role.color, roles.length), pick: role.pick === true });
  }

  const categories = [];
  const categoryNames = new Set();
  const channelNames = new Set();
  let channelTotal = 0;
  for (const category of Array.isArray(raw.categories) ? raw.categories.slice(0, CAPS.categories * 2) : []) {
    if (categories.length >= CAPS.categories) break;
    const name = clean(category?.name, CAPS.name);
    if (!name || categoryNames.has(name)) continue;
    const channels = [];
    for (const channel of Array.isArray(category.channels) ? category.channels.slice(0, CAPS.channelsPerCategory * 2) : []) {
      if (channels.length >= CAPS.channelsPerCategory || channelTotal >= CAPS.channelsTotal) break;
      const cleaned = clean(channel?.name, CAPS.name);
      if (!cleaned) continue;
      const voice = channel.type === "voice";
      const channelName = voice ? cleaned : textChannelName(cleaned);
      if (!channelName || channelNames.has(channelName)) continue;
      channelNames.add(channelName);
      const entry = { name: channelName, type: voice ? "voice" : "text" };
      if (!voice) {
        const topic = clean(channel.topic, CAPS.topic);
        if (topic) entry.topic = topic;
        if (channel.readonly === true) entry.readonly = true;
      }
      channels.push(entry);
      channelTotal += 1;
    }
    if (!channels.length) continue;
    categoryNames.add(name);
    categories.push({ name, channels });
  }
  if (!categories.length) throw new DesignError("no usable categories");

  const extraRules = (Array.isArray(raw.extraRules) ? raw.extraRules.slice(0, CAPS.rules * 2) : [])
    .map((rule) => clean(rule, CAPS.rule))
    .filter(Boolean)
    .slice(0, CAPS.rules);

  let welcome = clean(raw.welcome, CAPS.welcome);
  if (!welcome) welcome = "Chào {user}! Thầu đã dựng xong, giờ thì tự lo.";
  if (!welcome.includes("{user}")) welcome = `Chào {user}! ${welcome}`;

  return { id: "custom", label: clean(raw.label, 60) || "Theme riêng", welcome, roles, extraRules, categories };
}

// Keeps only the custom part of an edited blueprint plan
export function extractCustomTheme(plan) {
  const sharedCategories = new Set([infoCategory.name, djCategory.name, staffCategory.name]);
  const sharedRoleKeys = new Set(baseRoles.map((r) => r.key));
  return sanitizeCustomTheme({
    label: plan.label,
    welcome: plan.welcome,
    roles: plan.roles.filter((r) => !sharedRoleKeys.has(r.key)).map((r) => ({ name: r.name, color: r.color, pick: r.pick === true })),
    extraRules: plan.rules.slice(baseRules.length),
    categories: plan.categories
      .filter((c) => !sharedCategories.has(c.name))
      .map((c) => ({ name: c.name, channels: c.channels.map((ch) => ({ name: ch.name, type: ch.type, topic: ch.topic, readonly: ch.readonly })) })),
  });
}

// The plan for a saved theme, ready for the blueprint editor
// options.humor picks the wording of the shared rules, like for built-in themes
export const composeCustom = (theme, options = {}) => composePlan([sanitizeCustomTheme(theme)], options);

// ---- storage (table custom_themes) ----

export function normalizeThemeName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

const sameName = "guild_id = ? AND lower(name) = lower(?)";

export const countCustomThemes = (guildId) => getDb().prepare("SELECT COUNT(*) AS n FROM custom_themes WHERE guild_id = ?").get(guildId).n;

export const hasCustomTheme = (guildId, name) => Boolean(getDb().prepare(`SELECT 1 FROM custom_themes WHERE ${sameName}`).get(guildId, name));

// Saving under a name that exists replaces it. Returns whether it replaced one.
export function saveCustomTheme(guildId, name, theme, now = Date.now()) {
  const clean = sanitizeCustomTheme(theme);
  const db = getDb();
  const replaced = hasCustomTheme(guildId, name);
  db.prepare(`DELETE FROM custom_themes WHERE ${sameName}`).run(guildId, name);
  db.prepare("INSERT INTO custom_themes (guild_id, name, theme, created_at) VALUES (?, ?, ?, ?)").run(guildId, name, JSON.stringify(clean), now);
  return { replaced };
}

export function listCustomThemes(guildId) {
  return getDb()
    .prepare("SELECT name, theme, created_at FROM custom_themes WHERE guild_id = ? ORDER BY created_at DESC")
    .all(guildId)
    .map((row) => {
      let label = "";
      let categories = 0;
      let channels = 0;
      try {
        const theme = sanitizeCustomTheme(JSON.parse(row.theme));
        label = theme.label;
        categories = theme.categories.length;
        channels = theme.categories.reduce((n, c) => n + c.channels.length, 0);
      } catch {
        // an unreadable row is still listed so it can be deleted
      }
      return { name: row.name, createdAt: row.created_at, label, categories, channels };
    });
}

// Loaded themes go through the strict rebuild again, because the database is data too
export function getCustomTheme(guildId, name) {
  const row = getDb().prepare(`SELECT name, theme FROM custom_themes WHERE ${sameName}`).get(guildId, name);
  if (!row) return null;
  return { name: row.name, theme: sanitizeCustomTheme(JSON.parse(row.theme)) };
}

export const deleteCustomTheme = (guildId, name) => Number(getDb().prepare(`DELETE FROM custom_themes WHERE ${sameName}`).run(guildId, name).changes);

// The plan decides how many a server may keep; replacing a name that exists never needs a free slot
export function gateSave(guildId, name) {
  const used = countCustomThemes(guildId) - (hasCustomTheme(guildId, name) ? 1 : 0);
  return gateLimit(guildId, "customThemes", Math.max(0, used), "theme riêng");
}

// ---- files ----

export function exportCustomTheme(name, theme) {
  return JSON.stringify({ kind: FILE_KIND, version: 1, name, theme: sanitizeCustomTheme(theme) }, null, 2);
}

export function parseThemeFile(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > FILE_MAX_BYTES) throw new DesignError("file too large");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DesignError("not valid JSON");
  }
  if (!isObject(raw) || raw.kind !== FILE_KIND || raw.version !== 1) throw new DesignError("not a theme file");
  return { name: normalizeThemeName(raw.name), theme: sanitizeCustomTheme(raw.theme) };
}
