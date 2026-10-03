import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import { findingTexts as t, permLabels } from "../humor/audit.js";
import { DANGEROUS, MODERATION, hasAny, namesIn, toBits } from "./perms.js";

// A pure rule engine: facts in, findings out. Every rule is its own function so it can be tested alone.
// A finding is { id, severity: "cao" | "vua" | "thap", title, detail, fixId? }.

export const SEVERITY_ORDER = { cao: 0, vua: 1, thap: 2 };

const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum];
const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const isObject = (v) => v && typeof v === "object";
const asArray = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const level = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const label = (name) => permLabels[name] ?? name;

// Rebuilds facts so a missing or odd field can never make a rule throw. Safe to call on facts that are already clean.
export function normalizeFacts(raw) {
  const f = isObject(raw) ? raw : {};
  const guildId = typeof f.guildId === "string" ? f.guildId : null;
  const roles = asArray(f.roles).map((r) => ({
    id: String(r.id ?? ""),
    name: typeof r.name === "string" ? r.name : "",
    position: level(r.position) ?? 0,
    managed: Boolean(r.managed),
    isEveryone: r.isEveryone === true || (guildId !== null && r.id === guildId) || r.name === "@everyone",
    permissions: toBits(r.permissions),
  }));
  const channels = asArray(f.channels).map((c) => ({
    id: String(c.id ?? ""),
    name: typeof c.name === "string" ? c.name : "",
    type: level(c.type),
    parentId: typeof c.parentId === "string" && c.parentId ? c.parentId : null,
    overwrites: asArray(c.overwrites).map((o) => ({ id: String(o.id ?? ""), type: level(o.type), allow: toBits(o.allow), deny: toBits(o.deny) })),
  }));
  return {
    guildId,
    name: typeof f.name === "string" ? f.name : "",
    memberCount: level(f.memberCount),
    verificationLevel: level(f.verificationLevel),
    explicitContentFilter: level(f.explicitContentFilter),
    mfaLevel: level(f.mfaLevel),
    systemChannelId: typeof f.systemChannelId === "string" && f.systemChannelId ? f.systemChannelId : null,
    rulesChannelId: typeof f.rulesChannelId === "string" && f.rulesChannelId ? f.rulesChannelId : null,
    roles,
    channels,
    counts: { roles: level(f.counts?.roles) ?? roles.length, channels: level(f.counts?.channels) ?? channels.length },
  };
}

const finding = (id, severity, texts, fixId) => ({ id, severity, ...texts, ...(fixId ? { fixId } : {}) });
const everyoneOf = (f) => f.roles.find((r) => r.isEveryone) ?? null;
const plainRoles = (f) => f.roles.filter((r) => !r.isEveryone && !r.managed);
const isModerator = (r) => hasAny(r.permissions, MODERATION) || hasAny(r.permissions, ["Administrator"]);

// Names compared without accents, case or separators, so "📢┃Thông Báo" matches "thong-bao"
export const plainName = (name) =>
  String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const nameHas = (channel, words) => words.some((w) => plainName(channel.name).includes(w));

export function everyoneDangerous(facts) {
  const f = normalizeFacts(facts);
  const everyone = everyoneOf(f);
  const names = everyone ? namesIn(everyone.permissions, DANGEROUS) : [];
  return names.length ? [finding("everyone-dangerous", "cao", t.everyoneDangerous(names.map(label)), "strip-everyone")] : [];
}

export function manyAdminRoles(facts) {
  const f = normalizeFacts(facts);
  const admins = plainRoles(f).filter((r) => hasAny(r.permissions, ["Administrator"]));
  return admins.length > 3 ? [finding("many-admin-roles", "cao", t.manyAdmins(admins.map((r) => r.name)))] : [];
}

export function noModeratorRole(facts) {
  const f = normalizeFacts(facts);
  return plainRoles(f).some(isModerator) ? [] : [finding("no-moderator", "vua", t.noModerator)];
}

export function verificationNone(facts) {
  const f = normalizeFacts(facts);
  return f.verificationLevel === 0 ? [finding("verification-none", "vua", t.verificationNone, "verification-medium")] : [];
}

export function contentFilterOff(facts) {
  const f = normalizeFacts(facts);
  return f.explicitContentFilter === 0 ? [finding("content-filter-off", "vua", t.filterOff, "content-filter")] : [];
}

export function mfaOff(facts) {
  const f = normalizeFacts(facts);
  return f.mfaLevel === 0 ? [finding("mfa-off", "vua", t.mfaOff)] : [];
}

export function noRulesChannel(facts) {
  const f = normalizeFacts(facts);
  if (f.rulesChannelId) return [];
  return f.channels.some((c) => nameHas(c, ["luat", "rules"])) ? [] : [finding("no-rules-channel", "thap", t.noRules)];
}

export function noSystemChannel(facts) {
  const f = normalizeFacts(facts);
  if (f.systemChannelId) return [];
  return f.channels.some((c) => nameHas(c, ["welcome", "chao"])) ? [] : [finding("no-system-channel", "thap", t.noSystemChannel)];
}

// Whether @everyone can read and write a channel, from its own overwrite and the @everyone role. Category overwrites do not count, a channel uses its own.
function everyoneCanSend(f, channel, everyone) {
  if (!everyone || !TEXT_TYPES.includes(channel.type)) return false;
  const base = everyone.permissions;
  if ((base & P.Administrator) !== 0n) return true;
  const own = channel.overwrites.find((o) => o.id === everyone.id || o.id === f.guildId);
  const decide = (flag, fallback) => {
    if (own && (own.deny & flag) !== 0n) return false;
    if (own && (own.allow & flag) !== 0n) return true;
    return fallback;
  };
  return decide(P.ViewChannel, (base & P.ViewChannel) !== 0n) && decide(P.SendMessages, (base & P.SendMessages) !== 0n);
}

export function announceWritable(facts) {
  const f = normalizeFacts(facts);
  const everyone = everyoneOf(f);
  const open = f.channels.filter((c) => nameHas(c, ["thong-bao", "announce", "rules", "luat"]) && everyoneCanSend(f, c, everyone));
  return open.length ? [finding("announce-writable", "vua", t.announceWritable(open.map((c) => `#${c.name}`)))] : [];
}

export function emptyCategories(facts) {
  const f = normalizeFacts(facts);
  const parents = new Set(f.channels.map((c) => c.parentId).filter(Boolean));
  const empty = f.channels.filter((c) => c.type === ChannelType.GuildCategory && !parents.has(c.id));
  return empty.length ? [finding("empty-categories", "thap", t.emptyCategories(empty.map((c) => c.name)))] : [];
}

export function voiceOutsideCategory(facts) {
  const f = normalizeFacts(facts);
  if (!f.channels.some((c) => c.type === ChannelType.GuildCategory)) return [];
  const loose = f.channels.filter((c) => VOICE_TYPES.includes(c.type) && !c.parentId);
  return loose.length ? [finding("voice-outside-category", "thap", t.voiceOutside(loose.map((c) => c.name)))] : [];
}

export function duplicateChannelNames(facts) {
  const f = normalizeFacts(facts);
  const seen = new Map();
  for (const c of f.channels) {
    if (c.type === ChannelType.GuildCategory || !c.name) continue;
    const key = `${VOICE_TYPES.includes(c.type) ? "voice" : "text"}:${plainName(c.name)}`;
    seen.set(key, [...(seen.get(key) ?? []), c.name]);
  }
  const dupes = [...seen.values()].filter((names) => names.length > 1).map((names) => names[0]);
  return dupes.length ? [finding("duplicate-channel-names", "thap", t.duplicateNames(dupes))] : [];
}

// Discord allows 250 roles and 500 channels; the warnings start early enough to leave room to clean up
export function roleCount(facts) {
  const f = normalizeFacts(facts);
  return f.counts.roles > 200 ? [finding("role-count", "vua", t.roleCount(f.counts.roles))] : [];
}

export function channelCount(facts) {
  const f = normalizeFacts(facts);
  return f.counts.channels > 450 ? [finding("channel-count", "vua", t.channelCount(f.counts.channels))] : [];
}

// A role with dangerous powers (but not Administrator, which normally sits on top) ranked above every moderator role, so moderators cannot manage it
export function roleAboveModerators(facts) {
  const f = normalizeFacts(facts);
  const mods = plainRoles(f).filter((r) => hasAny(r.permissions, MODERATION));
  if (!mods.length) return [];
  const top = Math.max(...mods.map((r) => r.position));
  const dangerousNoAdmin = DANGEROUS.filter((name) => name !== "Administrator");
  const above = plainRoles(f).filter((r) => r.position > top && hasAny(r.permissions, dangerousNoAdmin) && !hasAny(r.permissions, ["Administrator"]));
  return above.length ? [finding("role-above-moderators", "thap", t.roleAboveMods(above.map((r) => r.name)))] : [];
}

export const RULES = [
  { id: "everyone-dangerous", run: everyoneDangerous },
  { id: "many-admin-roles", run: manyAdminRoles },
  { id: "no-moderator", run: noModeratorRole },
  { id: "verification-none", run: verificationNone },
  { id: "content-filter-off", run: contentFilterOff },
  { id: "mfa-off", run: mfaOff },
  { id: "no-rules-channel", run: noRulesChannel },
  { id: "no-system-channel", run: noSystemChannel },
  { id: "announce-writable", run: announceWritable },
  { id: "empty-categories", run: emptyCategories },
  { id: "voice-outside-category", run: voiceOutsideCategory },
  { id: "duplicate-channel-names", run: duplicateChannelNames },
  { id: "role-count", run: roleCount },
  { id: "channel-count", run: channelCount },
  { id: "role-above-moderators", run: roleAboveModerators },
];

// All findings, worst first. A rule that fails on strange data is skipped rather than losing the whole report.
export function runRules(facts) {
  const f = normalizeFacts(facts);
  const found = [];
  for (const rule of RULES) {
    try {
      found.push(...rule.run(f));
    } catch {
      // skipped on purpose
    }
  }
  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
