// Everything the stats channels (/kenhthongke) say, in one place so the voice is easy to adjust.

export const KIND_LABEL = { members: "thành viên", boosts: "lượt boost", channels: "kênh", roles: "role" };
export const KIND_TEMPLATE = { members: "Thành viên: {n}", boosts: "Boost: {n}", channels: "Kênh: {n}", roles: "Role: {n}" };

export const lines = {
  noGuild: "Lệnh này chỉ chạy trong server thôi đại ca.",
  notVoice: "Kênh thống kê phải là kênh thoại.",
  needOne: "Chọn một kênh thoại có sẵn, hoặc đặt `tao` là Có để thầu dựng kênh khoá cho bạn. Chọn cả hai thì thầu rối.",
  needBoth: "Chỉ chọn một thôi: kênh có sẵn hoặc `tao`, không phải cả hai.",
  badTemplate: "Mẫu tên phải có `{n}` để thầu chèn con số vào, ví dụ `Thành viên: {n}`.",
  already: (id) => `<#${id}> đang là kênh thống kê rồi. Xoá đi rồi thêm lại nếu muốn đổi loại.`,
  isTempRoom: "Kênh này là phòng tạm của thầu, sẽ bị dọn khi trống. Chọn kênh khác.",
  added: (id, kind, count, max) => `✅ <#${id}> sẽ hiện số ${KIND_LABEL[kind]} (${count}/${max}). Thầu cập nhật mỗi 10 phút vì Discord chỉ cho đổi tên kênh vài lần mỗi 10 phút.`,
  created: (id) => `Thầu đã dựng kênh <#${id}>, khoá không cho ai vào.`,
  addedNoManage: (names) => `Lưu ý: thầu đang thiếu quyền ${names.join(", ")} ở kênh này nên chưa đổi tên được.`,
  createFailed: (names) => (names.length ? `Thầu không dựng được kênh vì thiếu quyền ${names.join(", ")}.` : "Discord không cho thầu dựng kênh lúc này. Thử lại sau chút."),
  removed: (id, deleted) => `🗑️ Đã bỏ <#${id}> khỏi kênh thống kê.${deleted ? " Kênh do thầu dựng nên thầu đã xoá luôn." : " Kênh vẫn còn, thầu không đập."}`,
  notListed: "Kênh này không nằm trong danh sách thống kê.",
  empty: "Chưa có kênh thống kê nào. Gõ `/kenhthongke them` để mở màn.",
  listTitle: "📊 Kênh thống kê",
  turnedOff: "⏹️ Đã tắt kênh thống kê. Tên kênh giữ nguyên số cuối cùng, thầu không đụng nữa.",
  turnedOn: "✅ Kênh thống kê đang chạy.",
  gone: "kênh đã bị xoá",
  noManage: (names) => `thiếu quyền ${names.join(", ")}`,
  reason: "Cập nhật kênh thống kê",
  reasonCreate: "Kênh thống kê",
};
