// Every line the activity system (xp, levels, rank) says, in one place so the voice is easy to adjust.

export const levelUp = (userId, level) => `🎉 <@${userId}> vừa lên **cấp ${level}**. Chat nhiều quá thầu phải thêm gạch vô bảng xếp hạng.`;

export const lines = {
  off: "Tính năng điểm hoạt động đang tắt ở server này. Admin gõ `/hang caidat bat:true` để bật công trường lên.",
  nobody: "Chưa có ai có điểm hoạt động. Chat đi, thầu đang cầm sổ chờ đây.",
  bangTitle: "🏗️ Bảng xếp hạng hoạt động",
  rankTitle: (name) => `🏗️ Hạng của ${name}`.slice(0, 250),
  botNoRank: "Bot không đi làm công trường, khỏi xếp hạng.",
  noXpYet: "Người này chưa có điểm hoạt động nào. Còn lạ lắm, chưa có hồ sơ.",
  fieldLevel: "Cấp độ",
  fieldXp: "Điểm",
  fieldRank: "Hạng trong server",
  fieldMsgs: "Tin nhắn có điểm",
  fieldVoice: "Phút trong voice",
  maxLevel: "Đã đạt cấp tối đa. Thầu hết gạch để thưởng rồi.",
  nextLevel: (into, needed, next) => `${into}/${needed} điểm tới cấp ${next}`,
  footer: "Điểm tính theo thời gian chat và voice, có giới hạn mỗi ngày để không ai cày thuê.",
  notAdmin: "Cài đặt điểm hoạt động là việc của admin. Bạn xem hạng bằng `/hang xem` thôi nha.",
  saved: "✅ Đã lưu cài đặt điểm hoạt động.",
  plan: (message) => message,
  missingPerm: (names) => `Lưu ý: thầu đang thiếu quyền ${names.join(", ")} nên một phần tính năng sẽ chạy âm thầm. Báo admin cấp giùm.`,
  noChange: "Bạn chưa chọn gì để đổi. Thử `bat:true` hoặc một con số.",
  summary: (s) =>
    [
      `Trạng thái: **${s.enabled ? "bật" : "tắt"}**`,
      `Mỗi tin nhắn: **${s.xpPerMessage}** điểm, cách nhau tối thiểu **${s.cooldownSec}** giây, tối đa **${s.dailyCap}** điểm mỗi ngày`,
      `Voice: **${s.voiceEnabled ? "bật" : "tắt"}**, **${s.voiceXpPerMin}** điểm mỗi phút`,
      `Kênh báo lên cấp: ${s.announceChannelId ? `<#${s.announceChannelId}>` : "không có"}`,
    ].join("\n"),
};
