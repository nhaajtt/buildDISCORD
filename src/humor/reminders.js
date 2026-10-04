// Every line the personal reminders (/nhacviec) say, in one place so the voice is easy to adjust.

export const lines = {
  badBody: "Nội dung trống trơn hoặc toàn ký tự lạ. Thầu nhắc cái gì bây giờ?",
  needWhen: "Cho thầu biết nhắc khi nào: chọn `saunua` hoặc gõ giờ vào `luc` (ví dụ 21:30).",
  bothWhen: "Chọn một thôi đại ca: `saunua` hoặc `luc`, đừng đưa cả hai, thầu rối.",
  badAfter: "Mốc `saunua` này thầu không nhận. Chọn trong danh sách có sẵn.",
  emptyClock: "Ô `luc` trống. Gõ giờ dạng HH:mm, ví dụ 07:30 hoặc 21:05.",
  badClock: "Giờ này thầu đọc không ra. Gõ dạng HH:mm, ví dụ 07:30 hoặc 21:05.",
  clockRange: "Giờ phải từ 00:00 đến 23:59. Ngày của thầu chỉ có 24 tiếng thôi.",
  tooFar: "Hẹn xa quá, thầu không nhớ nổi. Tối đa một năm.",
  tooMany: (max) => `Bạn đang có ${max} lời nhắc chưa tới giờ rồi. Xoá bớt một cái bằng \`/nhacviec xoa\` đã.`,
  tooManyHere: (max) => `Ở server này bạn đã có ${max} lời nhắc chờ rồi. Xoá bớt một cái đã.`,
  created: (id, dueSec, tomorrow) =>
    `⏰ Ghi sổ lời nhắc #${id}. Thầu sẽ réo bạn <t:${dueSec}:R> (<t:${dueSec}:f>${tomorrow ? ", ngày mai" : ""}). Nhớ mở DM để thầu gửi được.`,
  listEmpty: "Bạn chưa có lời nhắc nào đang chờ. Gõ `/nhacviec tao` để nhờ thầu nhớ giùm.",
  listTitle: "⏰ Lời nhắc đang chờ của bạn",
  listRow: (r, dueSec) => `**#${r.id}** <t:${dueSec}:R> (<t:${dueSec}:f>): ${r.body}`,
  deleted: (id) => `🗑️ Đã xoá lời nhắc #${id}. Thầu quên luôn, không réo nữa.`,
  missing: "Không thấy lời nhắc đó trong danh sách của bạn. Có thể nó đã được gửi hoặc đã xoá.",
  dmBody: (body) => `⏰ Nhắc việc từ thầu: ${body}`,
  lateBody: (body) => `⏰ Nhắc việc từ thầu (trễ chút vì thầu nghỉ phép): ${body}`,
  channelBody: (userId, body, late) => `<@${userId}> ⏰ ${late ? "Nhắc việc (trễ chút), " : "Nhắc việc, "}thầu gõ DM không được nên réo ở đây: ${body}`,
};
