import { getDb } from "./db.js";

// Per-server settings for the admin tools (welcome flow, AutoMod, tickets). One JSON document per server, one section per tool.
// Every section has defaults and a normalizer that rebuilds the value field by field, so whatever arrives from a command, a modal or
// the dashboard is cleaned the same way before it is stored or used.

export const SNOWFLAKE = /^\d{17,20}$/;
const id = (value) => (typeof value === "string" && SNOWFLAKE.test(value) ? value : null);
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const text = (value, max) => (typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "");
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const whole = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const ids = (value, max) => (Array.isArray(value) ? [...new Set(value.map(id).filter(Boolean))].slice(0, max) : []);

export const AUTOMOD_LEVELS = ["nhe", "vua", "gat"];

export const SECTIONS = {
  welcome: {
    defaults: { enabled: false, channelId: null, message: "", verifyEnabled: false, verifyRoleId: null, newbieRoleId: null },
    normalize: (v = {}) => ({
      enabled: flag(v.enabled, false),
      channelId: id(v.channelId),
      // {user} becomes a mention, {server} the server's name
      message: text(v.message, 500),
      verifyEnabled: flag(v.verifyEnabled, false),
      verifyRoleId: id(v.verifyRoleId),
      newbieRoleId: id(v.newbieRoleId),
    }),
  },
  automod: {
    defaults: { enabled: false, level: "vua", logChannelId: null, blockInvites: true, blockLinks: false, mentionLimit: 5, exemptRoleIds: [], ruleIds: {} },
    normalize: (v = {}) => ({
      enabled: flag(v.enabled, false),
      level: oneOf(v.level, AUTOMOD_LEVELS, "vua"),
      logChannelId: id(v.logChannelId),
      blockInvites: flag(v.blockInvites, true),
      blockLinks: flag(v.blockLinks, false),
      mentionLimit: whole(v.mentionLimit, 3, 20, 5),
      exemptRoleIds: ids(v.exemptRoleIds, 20),
      // the Discord rules this bot created, by purpose, so it can update or remove exactly those and nothing else
      ruleIds: Object.fromEntries(
        Object.entries(v.ruleIds && typeof v.ruleIds === "object" ? v.ruleIds : {})
          .filter(([key, value]) => /^[a-z0-9-]{1,24}$/.test(key) && id(value))
          .slice(0, 10),
      ),
    }),
  },
  tickets: {
    defaults: {
      enabled: false,
      panelChannelId: null,
      panelMessageId: null,
      staffRoleId: null,
      categoryId: null,
      logChannelId: null,
      types: [{ key: "ho-tro", label: "Hỗ trợ", emoji: "🛟" }],
      maxOpenPerUser: 1,
      autoCloseHours: 48,
    },
    normalize: (v = {}) => {
      const types = (Array.isArray(v.types) ? v.types : [])
        .map((t) => ({ key: text(t?.key, 20).toLowerCase().replace(/[^a-z0-9-]/g, ""), label: text(t?.label, 40), emoji: text(t?.emoji, 8) }))
        .filter((t) => t.key && t.label);
      return {
        enabled: flag(v.enabled, false),
        panelChannelId: id(v.panelChannelId),
        panelMessageId: id(v.panelMessageId),
        staffRoleId: id(v.staffRoleId),
        categoryId: id(v.categoryId),
        logChannelId: id(v.logChannelId),
        types: (types.length ? types : SECTIONS.tickets.defaults.types).filter((t, i, all) => all.findIndex((o) => o.key === t.key) === i).slice(0, 5),
        maxOpenPerUser: whole(v.maxOpenPerUser, 1, 5, 1),
        autoCloseHours: whole(v.autoCloseHours, 0, 720, 48),
      };
    },
  },
};

export const SECTION_NAMES = Object.keys(SECTIONS);

function readAll(guildId) {
  const row = getDb().prepare("SELECT data FROM guild_settings WHERE guild_id = ?").get(guildId);
  if (!row) return {};
  try {
    return JSON.parse(row.data) ?? {};
  } catch {
    return {};
  }
}

function assertSection(name) {
  if (!SECTIONS[name]) throw new Error(`Unknown settings section: ${name}`);
}

// A section with its defaults filled in. Stored values are normalized again on the way out, so a damaged row cannot leak a bad value.
export function getSection(guildId, name) {
  assertSection(name);
  return SECTIONS[name].normalize(readAll(guildId)[name]);
}

// Replaces a section with the normalized form of `input` and returns what was stored
export function setSection(guildId, name, input) {
  assertSection(name);
  const clean = SECTIONS[name].normalize(input);
  const all = readAll(guildId);
  all[name] = clean;
  getDb()
    .prepare("INSERT INTO guild_settings (guild_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .run(guildId, JSON.stringify(all), Date.now());
  return clean;
}

// Changes only the given fields of a section
export function patchSection(guildId, name, patch) {
  return setSection(guildId, name, { ...getSection(guildId, name), ...patch });
}

export function clearSettings(guildId) {
  getDb().prepare("DELETE FROM guild_settings WHERE guild_id = ?").run(guildId);
}
