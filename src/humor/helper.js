// Lines for /vietgiup, the writing helper. Kept apart from the code so the voice is easy to adjust.

export const helperLines = {
  guildOnly: "Lệnh này chỉ chạy trong server.",
  off: "AI chưa được bật trên bot này. Chủ bot cần dán khoá API vào cấu hình.",
  quota: (cap, label) => `Tháng này server đã dùng hết ${cap} lượt AI của gói ${label}. Qua tháng mới được cấp lại.`,
  noReport: "Chưa có kết quả khám nào để giải thích. Gõ `/khamsuckhoe kiemtra` trước, rồi quay lại đây.",
  resultNote: "Bản nháp của thầu, đại ca đọc lại rồi hãy dùng. Thầu không tự đăng gì hết.",
  titles: { luat: "📜 Bản nháp luật server", loichao: "👋 Bản nháp lời chào", thongbao: "📣 Bản nháp thông báo", giaithich: "🩺 Giải thích kết quả khám" },
  sendHere: "Gửi vào kênh này",
  copy: "Lấy bản để copy",
  pickChannel: "Hoặc chọn kênh để gửi",
  sent: (channelId) => `Đã gửi vào <#${channelId}>. Xong, thầu rút.`,
  badChannel: "Kênh này không hợp lệ hoặc không phải kênh chat. Chọn kênh khác nhé.",
  noPostPerm: "Thầu hoặc bạn không có quyền xem và gửi tin trong kênh đó. Cấp quyền rồi thử lại.",
  noText: "Bản nháp không còn nữa, gọi `/vietgiup` lại nhé.",
  sendFailed: "Không gửi được, kênh đó có thể đã bị xoá hoặc thầu thiếu quyền.",
  failure: {
    off: "AI chưa được bật trên bot này. Chủ bot cần kiểm tra cấu hình. Lượt của bạn không bị tính.",
    key: "AI đang bị từ chối (khoá API có vấn đề). Chủ bot cần kiểm tra lại. Lượt của bạn không bị tính.",
    quota: "AI hết hạn mức hôm nay, nó đi ngủ rồi. Thử lại sau nhé. Lượt của bạn không bị tính.",
    busy: "Nhiều người đang nhờ AI cùng lúc, đợi một phút rồi gõ lại nhé. Lượt của bạn không bị tính.",
    unavailable: "AI của Google đang quá tải, thử lại sau vài phút nhé. Lượt của bạn không bị tính.",
    bad: "AI nghĩ ra thứ không dùng được. Thử mô tả rõ hơn nhé. Lượt của bạn không bị tính.",
  },
};
