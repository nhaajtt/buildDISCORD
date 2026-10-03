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

export const SECTIONS_MORE = {
  security: {
    defaults: {
      raidEnabled: false,
      raidJoins: 8,
      raidWindowSec: 30,
      raidAction: "verify",
      lockMinutes: 10,
      alertChannelId: null,
      nukeEnabled: false,
      nukeThreshold: 3,
      nukeWindowSec: 60,
      lockdown: { active: false, since: 0, prevVerification: null, channels: [] },
    },
    normalize: (v = {}) => {
      const lock = v.lockdown && typeof v.lockdown === "object" ? v.lockdown : {};
      return {
        raidEnabled: flag(v.raidEnabled, false),
        raidJoins: whole(v.raidJoins, 3, 50, 8),
        raidWindowSec: whole(v.raidWindowSec, 10, 300, 30),
        // alert only, raise the verification level, or lock the channels for a while
        raidAction: oneOf(v.raidAction, ["alert", "verify", "lock"], "verify"),
        lockMinutes: whole(v.lockMinutes, 1, 120, 10),
        alertChannelId: id(v.alertChannelId),
        nukeEnabled: flag(v.nukeEnabled, false),
        nukeThreshold: whole(v.nukeThreshold, 2, 10, 3),
        nukeWindowSec: whole(v.nukeWindowSec, 10, 600, 60),
        // what a lockdown changed, so it can be put back exactly as it was
        lockdown: {
          active: flag(lock.active, false),
          since: whole(lock.since, 0, Number.MAX_SAFE_INTEGER, 0),
          prevVerification: Number.isInteger(lock.prevVerification) && lock.prevVerification >= 0 && lock.prevVerification <= 4 ? lock.prevVerification : null,
          channels: (Array.isArray(lock.channels) ? lock.channels : [])
            .map((c) => ({ id: id(c?.id), sendMessages: oneOf(c?.sendMessages, ["neutral", "allow", "deny"], "neutral") }))
            .filter((c) => c.id)
            .slice(0, 150),
        },
      };
    },
  },
  activity: {
    defaults: { enabled: false, xpPerMessage: 5, cooldownSec: 60, dailyCap: 500, voiceEnabled: true, voiceXpPerMin: 2, announceChannelId: null },
    normalize: (v = {}) => ({
      enabled: flag(v.enabled, false),
      xpPerMessage: whole(v.xpPerMessage, 1, 50, 5),
      cooldownSec: whole(v.cooldownSec, 10, 600, 60),
      dailyCap: whole(v.dailyCap, 50, 5000, 500),
      voiceEnabled: flag(v.voiceEnabled, true),
      voiceXpPerMin: whole(v.voiceXpPerMin, 0, 20, 2),
      announceChannelId: id(v.announceChannelId),
    }),
  },
  digest: {
    defaults: { enabled: false, channelId: null, weekday: 1, hour: 9, auditWeekly: true, lastSentAt: 0, lastAuditAt: 0, lastScore: null },
    normalize: (v = {}) => ({
      enabled: flag(v.enabled, false),
      channelId: id(v.channelId),
      weekday: whole(v.weekday, 0, 6, 1),
      hour: whole(v.hour, 0, 23, 9),
      auditWeekly: flag(v.auditWeekly, true),
      lastSentAt: whole(v.lastSentAt, 0, Number.MAX_SAFE_INTEGER, 0),
      lastAuditAt: whole(v.lastAuditAt, 0, Number.MAX_SAFE_INTEGER, 0),
      lastScore: Number.isInteger(v.lastScore) && v.lastScore >= 0 && v.lastScore <= 100 ? v.lastScore : null,
    }),
  },
  modlog: {
    defaults: { enabled: false, channelId: null, logBans: true, logTimeouts: true, logRoles: true, logAutomod: true },
    normalize: (v = {}) => ({
      enabled: flag(v.enabled, false),
      channelId: id(v.channelId),
      logBans: flag(v.logBans, true),
      logTimeouts: flag(v.logTimeouts, true),
      logRoles: flag(v.logRoles, true),
      logAutomod: flag(v.logAutomod, true),
    }),
  },
  setup: {
    defaults: { done: false, at: 0, themeIds: "", humor: null },
    normalize: (v = {}) => ({
      done: flag(v.done, false),
      at: whole(v.at, 0, Number.MAX_SAFE_INTEGER, 0),
      themeIds: text(v.themeIds, 120),
      humor: oneOf(v.humor, ["nhe", "troll", "nham"], null),
    }),
  },
};
Object.assign(SECTIONS, SECTIONS_MORE);

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
