// Every line the moderation commands and the mod log say, in one place so the voice is easy to adjust.

export const actionLabels = { warn: "Cảnh cáo", timeout: "Timeout", kick: "Đuổi", ban: "Cấm", unban: "Gỡ cấm" };

export const timeoutChoices = [
  { name: "60 giây", value: 60 },
  { name: "5 phút", value: 300 },
  { name: "1 giờ", value: 3600 },
  { name: "1 ngày", value: 86400 },
  { name: "1 tuần", value: 604800 },
];

export const permNames = { ModerateMembers: "Timeout thành viên", KickMembers: "Đuổi thành viên", BanMembers: "Cấm thành viên" };

export const modLines = {
  noGuild: "Lệnh này chỉ chạy trong server thôi đại ca.",
  noPermission: (perm) => `Bạn thiếu quyền ${permNames[perm] ?? perm} mà đòi xử người ta. Thầu không cho mượn búa đâu.`,
  botMissing: (perm) => `Thầu thiếu quyền ${permNames[perm] ?? perm} nên không làm được. Cấp quyền cho bot rồi gọi lại.`,
  blankReason: "Lý do trống trơn. Ghi vài chữ thôi, hồ sơ cần có cái để đọc.",
  notMember: "Người này không có trong server, thầu không xử được.",
  refusal: {
    self: "Tự xử mình hả? Thầu khâm phục nhưng không nhận việc này.",
    bot: "Xử thầu à? Thầu đang làm việc mà, đừng phá.",
    owner: "Đụng vào chủ server à? Thầu không muốn mất hợp đồng.",
    aboveYou: "Người này ngang hoặc cao hơn bạn trong danh sách role. Cấp dưới không xử cấp trên được.",
    aboveBot: "Role của người này ngang hoặc cao hơn role của thầu, thầu với không tới. Kéo role bot lên cao hơn trong Cài đặt server.",
    admin: "Người này là Administrator, Discord không cho timeout. Gỡ quyền trước đã.",
  },
  failed: (action) => `Discord không cho thầu ${action.toLowerCase()} người này. Kiểm tra quyền và vị trí role của bot.`,
  dm: {
    warn: (server, reason) => `Bạn nhận một lời cảnh cáo ở ${server}. Lý do: ${reason}`,
    timeout: (server, reason, until) => `Bạn bị timeout ở ${server} đến <t:${Math.floor(until / 1000)}:f>. Lý do: ${reason}`,
    kick: (server, reason) => `Bạn bị đuổi khỏi ${server}. Lý do: ${reason}`,
    ban: (server, reason) => `Bạn bị cấm khỏi ${server}. Lý do: ${reason}`,
  },
  done: {
    warn: (id, userId) => `⚠️ Đã ghi cảnh cáo hồ sơ #${id} cho <@${userId}>. Lần sau không còn là cảnh cáo đâu.`,
    timeout: (id, userId, until) => `🤐 Hồ sơ #${id}: <@${userId}> ngồi im đến <t:${Math.floor(until / 1000)}:R>.`,
    kick: (id, userId) => `👢 Hồ sơ #${id}: đã đuổi <@${userId}> ra khỏi công trường. Cổng vẫn mở, nhưng đi cho đàng hoàng.`,
    ban: (id, userId) => `🔨 Hồ sơ #${id}: đã cấm <@${userId}>. Biển cấm cửa đã đóng đinh.`,
  },
  hosoTitle: "Hồ sơ vi phạm",
  hosoEmpty: (userId) => `<@${userId}> sạch bong, chưa có dòng nào trong hồ sơ. Gương mẫu thấy ghê.`,
  hosoLine: (c) => `**#${c.id}** ${actionLabels[c.action] ?? c.action}, <t:${Math.floor(c.at / 1000)}:R>, bởi <@${c.mod_id}>${c.reason ? `: ${c.reason}` : ""}`,
  hosoFooter: (shown, total) => `Hiện ${shown} trên ${total} hồ sơ`,
  logCaseTitle: (c) => `Hồ sơ #${c.id}: ${actionLabels[c.action] ?? c.action}`,
  logBanTitle: "Có người bị cấm",
  logUnbanTitle: "Có người được gỡ cấm",
  logRoleTitle: "Quyền của role bị đổi",
  logAutomodTitle: "AutoMod chặn một tin",
  fieldUser: "Người bị xử",
  fieldMod: "Người xử",
  fieldReason: "Lý do",
  fieldUntil: "Đến",
  fieldRole: "Role",
  fieldAdded: "Được thêm",
  fieldRemoved: "Bị bỏ",
  fieldRule: "Luật",
  fieldChannel: "Kênh",
  fieldTrigger: "Loại",
  fieldUserAm: "Người vi phạm",
  noReason: "Không nêu lý do",
  noContentNote: "Nội dung tin nhắn không bao giờ được ghi lại.",
  triggers: { 1: "Từ khoá", 3: "Spam", 4: "Bộ từ khoá có sẵn", 5: "Spam mention", 6: "Hồ sơ thành viên" },
};
