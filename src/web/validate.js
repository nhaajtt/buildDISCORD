import { ChannelType } from "discord.js";
import { AUTOMOD_LEVELS, SNOWFLAKE, getSection } from "../settings.js";
import { roleProblem } from "../onboarding/safety.js";
import { chaomungLines, permLabels } from "../humor/onboarding.js";
import { checkStaffRole, typeKey, validEmoji } from "../tickets/logic.js";
import { cleanText, DURATIONS } from "../activity/text.js";
import { MAX_MENU_ROLES, MODES, checkPicks } from "../activity/rolemenus.js";
import { MAX_WINNERS } from "../activity/giveaways.js";

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

// A list of blocked words: each trimmed, lower-cased, at most 60 characters and carrying at least one letter or digit
const WORD_MAX = 60;
const WORDS_MAX = 500;
function cleanWords(v, f) {
  if (!Array.isArray(v) || v.length > WORDS_MAX) bad(`Ô "${f}" phải là danh sách tối đa ${WORDS_MAX} từ.`);
  const out = new Set();
  for (const word of v) {
    if (typeof word !== "string" || word.length > WORD_MAX * 2) bad(`Mỗi từ khoá phải là chữ và tối đa ${WORD_MAX} ký tự.`);
    const clean = cleanText(word, WORD_MAX + 1).toLowerCase();
    if (!clean) bad("Có từ khoá trống hoặc toàn ký tự lạ.");
    if (clean.length > WORD_MAX) bad(`Từ khoá "${clean.slice(0, 20)}..." dài quá ${WORD_MAX} ký tự.`);
    if (!/[\p{L}\p{N}]/u.test(clean)) bad(`Từ khoá "${clean}" không có chữ hay số nào, chặn kiểu này là chặn tất cả.`);
    out.add(clean);
  }
  return [...out];
}

const STAT_KINDS = ["members", "boosts", "channels", "roles"];
function cleanStatChannels(v, f) {
  if (!Array.isArray(v) || v.length > 4) bad(`Ô "${f}" phải là danh sách tối đa 4 kênh thống kê.`);
  const seen = new Set();
  return v.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) bad("Mỗi kênh thống kê phải là một đối tượng.");
    for (const key of Object.keys(entry)) if (!["channelId", "kind", "template"].includes(key)) bad(`Kênh thống kê có ô lạ: "${key.slice(0, 30)}".`);
    if (!isSnowflake(entry.channelId)) bad("Kênh thống kê có mã không hợp lệ.");
    if (!STAT_KINDS.includes(entry.kind)) bad("Kênh thống kê có loại số liệu lạ.");
    const template = typeof entry.template === "string" ? cleanText(entry.template, 61) : "";
    if (!template || template.length > 60) bad("Mẫu tên kênh thống kê phải từ 1 đến 60 ký tự.");
    if (!template.includes("{n}")) bad("Mẫu tên kênh thống kê phải có {n} để thầu điền con số vào.");
    if (seen.has(entry.channelId)) bad("Một kênh không thể làm hai thống kê.");
    seen.add(entry.channelId);
    return { channelId: entry.channelId, kind: entry.kind, template };
  });
}

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
    customWords: cleanWords,
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
  // lockdown is state the bot keeps, never something a request can set
  security: {
    raidEnabled: kinds.bool,
    raidJoins: kinds.int(3, 50),
    raidWindowSec: kinds.int(10, 300),
    raidAction: kinds.oneOf(["alert", "verify", "lock"]),
    lockMinutes: kinds.int(1, 120),
    alertChannelId: kinds.id,
    nukeEnabled: kinds.bool,
    nukeThreshold: kinds.int(2, 10),
    nukeWindowSec: kinds.int(10, 600),
    minAccountAgeDays: kinds.int(0, 365),
    youngAction: kinds.oneOf(["alert", "kick"]),
  },
  activity: {
    enabled: kinds.bool,
    xpPerMessage: kinds.int(1, 50),
    cooldownSec: kinds.int(10, 600),
    dailyCap: kinds.int(50, 5000),
    voiceEnabled: kinds.bool,
    voiceXpPerMin: kinds.int(0, 20),
    announceChannelId: kinds.id,
  },
  digest: {
    enabled: kinds.bool,
    channelId: kinds.id,
    weekday: kinds.int(0, 6),
    hour: kinds.int(0, 23),
    auditWeekly: kinds.bool,
  },
  modlog: {
    enabled: kinds.bool,
    channelId: kinds.id,
    logBans: kinds.bool,
    logTimeouts: kinds.bool,
    logRoles: kinds.bool,
    logAutomod: kinds.bool,
  },
  tempvoice: {
    enabled: kinds.bool,
    lobbyChannelIds: kinds.ids(5),
    categoryId: kinds.id,
    nameTemplate: (v, f) => {
      const clean = typeof v === "string" ? cleanText(v, 61) : "";
      return clean && clean.length <= 60 ? clean : bad(`Ô "${f}" phải có chữ và tối đa 60 ký tự.`);
    },
    userLimit: kinds.int(0, 99),
  },
  stats: {
    enabled: kinds.bool,
    channels: cleanStatChannels,
  },
  suggest: {
    enabled: kinds.bool,
    channelId: kinds.id,
    staffRoleId: kinds.id,
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
    if (section === "tempvoice") {
      for (const id of patch.lobbyChannelIds ?? []) channelOf(guild, id, [ChannelType.GuildVoice], "phòng chờ");
      if (patch.categoryId) channelOf(guild, patch.categoryId, [ChannelType.GuildCategory], "danh mục phòng tạm");
      const stats = new Set(getSection(guild.id, "stats").channels.map((c) => c.channelId));
      if ((merged.lobbyChannelIds ?? []).some((id) => stats.has(id))) bad("Kênh này đang dùng làm kênh thống kê, không làm phòng chờ được. Thầu sẽ đổi tên nó liên tục.");
      if (merged.enabled && !(merged.lobbyChannelIds ?? []).length) bad("Bật phòng tạm thì phải chọn ít nhất một phòng chờ.");
    }
    if (section === "stats") {
      for (const c of patch.channels ?? []) channelOf(guild, c.channelId, [ChannelType.GuildVoice], "thống kê");
      const lobbies = new Set(getSection(guild.id, "tempvoice").lobbyChannelIds);
      if ((patch.channels ?? []).some((c) => lobbies.has(c.channelId))) bad("Kênh này đang là phòng chờ tạo phòng, thầu không đổi tên nó thành số liệu được.");
      if (merged.enabled && !(merged.channels ?? []).length) bad("Bật thống kê thì phải chọn ít nhất một kênh.");
    }
    if (section === "suggest") {
      if (patch.channelId) channelOf(guild, patch.channelId, TEXT_TYPES, "góp ý");
      if (patch.staffRoleId && !checkStaffRole(roleOf(guild, patch.staffRoleId, "staff"), guild.id)) bad("Role staff không được là @everyone hay role của bot. Chọn role thật của đội ngũ.");
      if (merged.enabled && !merged.channelId) bad("Bật góp ý thì phải chọn kênh để thầu đăng.");
    }
    if (section === "security" && patch.alertChannelId) channelOf(guild, patch.alertChannelId, TEXT_TYPES, "cảnh báo");
    if (section === "activity" && patch.announceChannelId) channelOf(guild, patch.announceChannelId, TEXT_TYPES, "thông báo lên cấp");
    if (section === "digest") {
      if (patch.channelId) channelOf(guild, patch.channelId, TEXT_TYPES, "báo cáo tuần");
      if (merged.enabled && !merged.channelId) bad("Bật báo cáo tuần thì phải chọn kênh để thầu gửi.");
    }
    if (section === "modlog") {
      if (patch.channelId) channelOf(guild, patch.channelId, TEXT_TYPES, "nhật ký");
      if (merged.enabled && !merged.channelId) bad("Bật nhật ký quản trị thì phải chọn kênh để thầu ghi.");
    }
    return { patch };
  } catch (error) {
    if (error instanceof Invalid) return { error: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------- giveaways and role menus

// The bodies of the action routes are strict: a field that is not listed is an error, not something to ignore quietly
function onlyKeys(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) bad("Dữ liệu gửi lên phải là một đối tượng JSON.");
  for (const key of Object.keys(body)) if (!allowed.includes(key)) bad(`Có ô lạ trong dữ liệu gửi lên: "${key.slice(0, 30)}".`);
}

const wrap = (fn) => {
  try {
    return { value: fn() };
  } catch (error) {
    if (error instanceof Invalid) return { error: error.message };
    throw error;
  }
};

export const GIVEAWAY_PRIZE_MAX = 100;

export function validateGiveaway(body, guild) {
  return wrap(() => {
    onlyKeys(body, ["prize", "winners", "minutes", "roleId", "channelId"]);
    const prize = typeof body.prize === "string" ? cleanText(body.prize, GIVEAWAY_PRIZE_MAX + 1) : "";
    if (!prize) bad("Phần thưởng trống trơn hoặc toàn ký tự lạ. Thầu không phát không khí được.");
    if (prize.length > GIVEAWAY_PRIZE_MAX) bad(`Phần thưởng tối đa ${GIVEAWAY_PRIZE_MAX} ký tự.`);
    const winners = body.winners === undefined ? 1 : body.winners;
    if (!Number.isInteger(winners) || winners < 1 || winners > MAX_WINNERS) bad(`Số người trúng phải là số nguyên từ 1 đến ${MAX_WINNERS}.`);
    if (!DURATIONS.some((d) => d.value === body.minutes)) bad("Thời gian này thầu không nhận. Chọn trong danh sách có sẵn.");
    if (!isSnowflake(body.channelId)) bad("Chưa chọn kênh đăng giveaway.");
    const channel = channelOf(guild, body.channelId, TEXT_TYPES, "giveaway");
    let roleId = null;
    if (body.roleId !== undefined && body.roleId !== null) {
      if (!isSnowflake(body.roleId)) bad("Role yêu cầu có mã không hợp lệ.");
      if (body.roleId === guild.id) bad("Yêu cầu role @everyone thì ai cũng có, khỏi cần.");
      roleId = roleOf(guild, body.roleId, "yêu cầu").id;
    }
    return { prize, winners, minutes: body.minutes, channel, roleId };
  });
}

export const validateCount = (body) =>
  wrap(() => {
    onlyKeys(body, ["count"]);
    const count = body.count === undefined ? 1 : body.count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_WINNERS) bad(`Số người chọn thêm phải từ 1 đến ${MAX_WINNERS}.`);
    return { count };
  });

export const validateChannelOnly = (body, guild) =>
  wrap(() => {
    onlyKeys(body, ["channelId"]);
    if (!isSnowflake(body.channelId)) bad("Chưa chọn kênh đăng bảng.");
    return { channel: channelOf(guild, body.channelId, TEXT_TYPES, "đăng bảng") };
  });

export const validateEmpty = (body) => wrap(() => onlyKeys(body, []));

// Returns { value: { title, mode, picks, channel } } or { error }. The roles are judged by the same rules as /vaitro tao.
export function validateMenu(body, guild, { allowChannel = false } = {}) {
  return wrap(() => {
    onlyKeys(body, allowChannel ? ["title", "mode", "roles", "channelId"] : ["title", "mode", "roles"]);
    const title = typeof body.title === "string" ? cleanText(body.title, 101) : "";
    if (!title) bad("Tiêu đề trống trơn hoặc toàn ký tự lạ. Đặt tên cho đàng hoàng.");
    if (title.length > 100) bad("Tiêu đề tối đa 100 ký tự.");
    if (!MODES.includes(body.mode)) bad("Chế độ menu phải là chọn một hoặc chọn nhiều.");
    if (!Array.isArray(body.roles) || body.roles.length < 1 || body.roles.length > MAX_MENU_ROLES) bad(`Menu cần từ 1 đến ${MAX_MENU_ROLES} role.`);
    const picks = body.roles.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) bad("Mỗi role trong menu phải là một đối tượng.");
      for (const key of Object.keys(entry)) if (!["id", "emoji"].includes(key)) bad(`Role trong menu có ô lạ: "${key.slice(0, 30)}".`);
      if (!isSnowflake(entry.id)) bad("Role trong menu có mã không hợp lệ.");
      const emoji = entry.emoji === undefined || entry.emoji === null ? "" : entry.emoji;
      if (typeof emoji !== "string" || emoji.length > 8) bad("Emoji tối đa 8 ký tự.");
      return { role: roleOf(guild, entry.id, "trong menu"), emoji: cleanText(emoji, 8) };
    });
    const top = guild.members?.me?.roles?.highest?.position ?? -1;
    const problem = checkPicks(picks, top);
    if (problem) bad(problem);
    let channel = null;
    if (allowChannel && body.channelId !== undefined && body.channelId !== null) {
      if (!isSnowflake(body.channelId)) bad("Kênh đăng bảng có mã không hợp lệ.");
      channel = channelOf(guild, body.channelId, TEXT_TYPES, "đăng bảng");
    }
    return { title, mode: body.mode, picks, channel };
  });
}
