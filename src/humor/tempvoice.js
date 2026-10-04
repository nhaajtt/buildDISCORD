// Everything the temporary voice rooms (/phongtam) say, in one place so the voice is easy to adjust.

export const lines = {
  noGuild: "Lệnh này chỉ chạy trong server thôi đại ca.",
  notCategory: "Danh mục phải là một danh mục kênh thật sự.",
  notVoice: "Phòng chờ phải là kênh thoại thường, không phải sân khấu hay kênh chat.",
  alreadyRoom: "Kênh này là phòng tạm do thầu dựng, làm phòng chờ là phòng đẻ ra phòng, vô tận luôn. Chọn kênh khác.",
  lobbyAdded: (id, count, max) => `✅ <#${id}> là phòng chờ rồi (${count}/${max}). Ai bước vào là thầu dựng cho một phòng riêng.`,
  lobbyExists: (id) => `<#${id}> đã là phòng chờ từ trước rồi.`,
  lobbyRemoved: (id) => `🗑️ Đã bỏ <#${id}> khỏi danh sách phòng chờ. Kênh vẫn còn đó, thầu không đập.`,
  lobbyNotListed: "Kênh này không nằm trong danh sách phòng chờ.",
  needLobby: "Chưa có phòng chờ nào. Gõ `/phongtam them` và chọn một kênh thoại trước đã.",
  nothingChanged: "Không có gì để đổi. Cho thầu ít nhất một lựa chọn.",
  badTemplate: "Mẫu tên trống trơn hoặc toàn ký tự lạ. Thử lại, ví dụ `Phòng của {name}`.",
  saved: "✅ Đã lưu cài đặt phòng tạm.",
  turnedOn: "✅ Phòng tạm đang chạy.",
  turnedOff: "⏹️ Đã tắt phòng tạm. Phòng đang có người vẫn giữ, trống thì thầu dọn.",
  missingBot: (names) => `Lưu ý: thầu đang thiếu quyền ${names.join(", ")}, nên chưa dựng phòng được. Cấp quyền cho role của bot nha.`,
  statusTitle: "🎙️ Phòng tạm",
  lobbyGone: " (kênh đã bị xoá, thầu đã bỏ khỏi danh sách)",
  noCategory: "cùng danh mục với phòng chờ",
  categoryGone: "danh mục đã bị xoá, thầu dựng cùng danh mục với phòng chờ",
  limitNone: "không giới hạn",
  fine: "Quyền của thầu đủ dùng.",

  // Said to the person who joined a lobby (a direct message) when the room could not be made
  failMissingPerms: (names) => `Thầu không dựng được phòng cho bạn vì thiếu quyền ${names.join(", ")}. Nhờ quản trị viên cấp giúp.`,
  failCategoryFull: "Thầu không dựng được phòng vì danh mục đã đầy kênh. Nhờ quản trị viên dọn bớt hoặc đổi danh mục.",
  failCap: (max) => `Server đang có ${max} phòng tạm rồi, thầu không dựng thêm được. Đợi bớt phòng trống nhé.`,
  failGeneric: "Discord không cho thầu dựng phòng lúc này. Thử lại sau chút.",
  alertFail: (guildName, why) => `Phòng tạm ở ${guildName}: ${why}`.slice(0, 300),
  reason: "Phòng tạm",
  reasonCleanup: "Phòng tạm đã trống",
};
