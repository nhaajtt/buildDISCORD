import { ChannelType } from "discord.js";
import { AUTOMOD_LEVELS, SNOWFLAKE } from "../settings.js";
import { roleProblem } from "../onboarding/safety.js";
import { chaomungLines, permLabels } from "../humor/onboarding.js";
import { checkStaffRole, typeKey, validEmoji } from "../tickets/logic.js";

// Turns a request body into a clean patch for one settings section, or says why it cannot. Types are checked strictly here so a wrong
// type is a 400 instead of being silently turned into a default by the section normalizer.

export const isSnowflake = (value) => typeof value === "string" && SNOWFLAKE.test(value);

export const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
export const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

class Invalid extends Error {}
const bad = (message) => {
  throw new Invalid(message);
};

const kinds = {
  bool: (v, f) => (typeof v === "boolean" ? v : bad(`Ô "${f}" phải là bật hoặc tắt.`)),
  id: (v, f) => (v === null || isSnowflake(v) ? v : bad(`Ô "${f}" có mã không hợp lệ.`)),
  text: (max) => (v, f) => (typeof v === "string" && v.length <= max ? v : bad(`Ô "${f}" phải là chữ và tối đa ${max} ký tự.`)),
  int: (min, max) => (v, f) => (Number.isInteger(v) && v >= min && v <= max ? v : bad(`Ô "${f}" phải là số nguyên từ ${min} đến ${max}.`)),
  oneOf: (list) => (v, f) => (list.includes(v) ? v : bad(`Ô "${f}" có giá trị lạ.`)),
  ids: (max) => (v, f) => {
    if (!Array.isArray(v) || v.length > max || !v.every(isSnowflake)) bad(`Ô "${f}" phải là danh sách tối đa ${max} mã hợp lệ.`);
    return [...new Set(v)];
  },
};

const FIELDS = {
  welcome: {
    enabled: kinds.bool,
    channelId: kinds.id,
    message: kinds.text(500),
    verifyEnabled: kinds.bool,
    verifyRoleId: kinds.id,
    newbieRoleId: kinds.id,
  },
  automod: {
    enabled: kinds.bool,
    level: kinds.oneOf(AUTOMOD_LEVELS),
    logChannelId: kinds.id,
    blockInvites: kinds.bool,
    blockLinks: kinds.bool,
    mentionLimit: kinds.int(3, 20),
    exemptRoleIds: kinds.ids(20),
  },
  tickets: {
    enabled: kinds.bool,
    panelChannelId: kinds.id,
    staffRoleId: kinds.id,
    categoryId: kinds.id,
    logChannelId: kinds.id,
    maxOpenPerUser: kinds.int(1, 5),
    autoCloseHours: kinds.int(0, 720),
    types: (v) => v,
  },
};

function pick(section, body) {
  const patch = {};
  for (const [field, check] of Object.entries(FIELDS[section])) {
    if (Object.hasOwn(body, field)) patch[field] = check(body[field], field);
  }
  return patch;
}

const channelOf = (guild, id, types, label) => {
  const channel = guild.channels.cache.get(id);
  return channel && types.includes(channel.type) ? channel : bad(`Kênh ${label} không có trong server này hoặc không đúng loại.`);
};
const roleOf = (guild, id, label) => guild.roles.cache.get(id) ?? bad(`Role ${label} không có trong server này.`);

const reasonText = (problem) => (problem.code === "dangerous" ? chaomungLines.unsafe.dangerous(problem.names.map((n) => permLabels[n] ?? n)) : chaomungLines.unsafe[problem.code]);

function checkSafeRole(guild, id, label) {
  const role = roleOf(guild, id, label);
  const top = guild.members?.me?.roles?.highest?.position ?? -1;
  const problem = roleProblem(role, top);
  if (problem) bad(chaomungLines.unsafeRole(label, role.name ?? "?", reasonText(problem)));
}

function checkTypes(value, current) {
  if (!Array.isArray(value) || value.length < 1) bad("Phải có ít nhất một loại ticket.");
  if (value.length > 5) bad("Tối đa 5 loại ticket thôi, nhiều hơn là staff khóc.");
  const keys = [];
  const labels = new Set();
  const result = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) bad("Mỗi loại ticket phải có tên.");
    const label = typeof entry.label === "string" ? entry.label.replace(/\r/g, "").trim() : "";
    if (!label || label.length > 40) bad("Tên loại ticket phải từ 1 đến 40 ký tự.");
    const emoji = entry.emoji === undefined || entry.emoji === null ? "" : entry.emoji;
    if (typeof emoji !== "string" || emoji.length > 8 || !validEmoji(emoji)) bad("Emoji này Discord không nhận làm biểu tượng nút. Dùng emoji thường hoặc để trống.");
    if (labels.has(label.toLowerCase())) bad("Hai loại ticket trùng tên, đặt khác nhau cho đỡ lẫn.");
    labels.add(label.toLowerCase());
    // A key that is already in use keeps its button id, a new type gets one made from its name
    const given = typeof entry.key === "string" && /^[a-z0-9-]{1,20}$/.test(entry.key) && !keys.includes(entry.key) && current.types.some((t) => t.key === entry.key) ? entry.key : null;
    const key = given ?? typeKey(label, keys);
    keys.push(key);
    return { key, label, emoji };
  });
  return result;
}

// Returns { patch } or { error }. `current` is the stored section, used to check what the saved result would look like as a whole.
export function validateSection(section, body, guild, current) {
  try {
    if (!body || typeof body !== "object" || Array.isArray(body)) bad("Dữ liệu gửi lên phải là một đối tượng JSON.");
    const patch = pick(section, body);
    const merged = { ...current, ...patch };

    if (section === "welcome") {
      if (patch.channelId) channelOf(guild, patch.channelId, TEXT_TYPES, "chào mừng");
      if (patch.newbieRoleId) checkSafeRole(guild, patch.newbieRoleId, "người mới");
      if (patch.verifyRoleId) checkSafeRole(guild, patch.verifyRoleId, "xác minh");
      if (merged.verifyEnabled && !merged.verifyRoleId) bad(chaomungLines.needVerifyRole);
    }

    if (section === "automod") {
      if (patch.logChannelId) channelOf(guild, patch.logChannelId, TEXT_TYPES, "log");
      for (const id of patch.exemptRoleIds ?? []) {
        if (id === guild.id) bad("Không miễn trừ @everyone được, vậy là tắt AutoMod luôn còn gì.");
        roleOf(guild, id, "miễn trừ");
      }
    }

    if (section === "tickets") {
      if (patch.panelChannelId) channelOf(guild, patch.panelChannelId, TEXT_TYPES, "bảng ticket");
      if (patch.logChannelId) channelOf(guild, patch.logChannelId, TEXT_TYPES, "log");
      if (patch.categoryId) channelOf(guild, patch.categoryId, [ChannelType.GuildCategory], "danh mục");
      if (patch.staffRoleId && !checkStaffRole(roleOf(guild, patch.staffRoleId, "staff"), guild.id)) {
        bad("Role staff không được là @everyone hay role của bot. Chọn role thật của đội ngũ.");
      }
      if (Object.hasOwn(patch, "types")) patch.types = checkTypes(patch.types, current);
      const full = { ...current, ...patch };
      if (full.enabled && (!full.panelChannelId || !full.staffRoleId)) bad("Chưa đủ cài đặt: cần kênh đăng bảng và role staff.");
    }
    return { patch };
  } catch (error) {
    if (error instanceof Invalid) return { error: error.message };
    throw error;
  }
}
