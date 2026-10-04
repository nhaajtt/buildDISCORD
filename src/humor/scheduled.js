// Everything the scheduled messages (/hengio) say, in one place so the voice is easy to adjust.

export const lines = {
  noGuild: "Lệnh này chỉ chạy trong server thôi đại ca.",
  badTime: "Giờ phải viết dạng `HH:mm`, ví dụ `08:30` hoặc `21:00`.",
  badBody: "Nội dung trống trơn hoặc toàn ký tự lạ. Thầu không đăng không khí được.",
  badChannel: "Chọn kênh chat hoặc kênh thông báo để thầu đăng.",
  missingPerms: (names) => `Thầu thiếu quyền ${names.join(", ")} ở kênh đó nên không đăng được. Cấp quyền hoặc chọn kênh khác.`,
  created: (id, channelId, when) => `✅ Hẹn giờ #${id}: ${when} ở <#${channelId}>. Thầu đăng đúng giờ, không ping ai hết (kể cả @everyone hay role).`,
  daily: (hhmm) => `mỗi ngày lúc ${hhmm}`,
  weekly: (day, hhmm) => `mỗi ${day} lúc ${hhmm}`,
  listEmpty: "Chưa hẹn giờ tin nhắn nào. Gõ `/hengio tao` để mở màn.",
  listTitle: "⏰ Tin nhắn hẹn giờ",
  listRow: (r, when, nextSec) => `**#${r.id}** ${when}, <#${r.channel_id}>, ${r.status === "active" ? `lần tới <t:${nextSec}:R>` : "đang tạm dừng"}\n> ${r.preview}`,
  removed: (id) => `🗑️ Đã xoá hẹn giờ #${id}.`,
  missing: "Không thấy hẹn giờ số đó trong server này. Gõ `/hengio danhsach` để xem.",
  previewHead: "👀 Xem thử (chỉ mình bạn thấy, thầu chưa đăng gì):",
  needPreviewSource: "Cho thầu nội dung để xem thử, hoặc số của một hẹn giờ có sẵn.",
  previewOnlyOne: "Chọn nội dung hoặc số, không phải cả hai.",
  reasonBroken: "kênh đã bị xoá",
};
