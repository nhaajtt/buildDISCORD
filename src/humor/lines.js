export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const progressLines = [
  "Đang đổ bê tông cho kênh chat...",
  "Đang sơn tường, mời mọi người đứng xa...",
  "Đang thuê mod, lương trả bằng meme...",
  "Đang đóng biển 'cấm spam' (không ai đọc)...",
  "Đang lắp loa cho phòng karaoke tone điếc...",
  "Đang dán luật lên tường, mực vẫn còn ướt...",
  "Đang cãi nhau với thầu phụ về vị trí kênh meme...",
];

export const doneLines = [
  "Xong rồi đại ca! Server đã hoàn thiện, chưa nghiệm thu nhưng cứ dùng đi.",
  "Công trình hoàn tất! Bảo hành 0 ngày, hoàn tiền 0 đồng.",
  "Bàn giao xong! Có sai sót thì đó là tính năng.",
];

export const noPermissionLines = [
  "Tui là thầu xây dựng chứ không phải ông chủ. Bạn cần quyền Administrator mới gọi tui được.",
  "Ê, ai cho bạn gọi thầu vậy? Quyền Administrator đâu?",
];

export const missingBotPermsLine = (names) =>
  `Tui thiếu đồ nghề rồi: ${names.join(", ")}. Cấp quyền hoặc mời lại bot với quyền Administrator, thầu xây không thể xây bằng tay không.`;

export const busyLine = "Công trình này đang thi công, đừng giục. Giục là chậm hơn.";

export const cancelLine = "Ok, huỷ bản vẽ. Khi nào nghĩ ra thì gọi lại.";

export const confirmExpiredLine = "Bản vẽ hết hạn rồi. Gõ /build lại cho tui.";

export const nothingToNukeLine = "Tui chưa xây gì ở đây, đập cái gì bây giờ? Gõ /build trước đi.";

export const nukeDoneLine = (removed) =>
  `Đập xong ${removed} hạng mục. Server sạch như ví cuối tháng. Gõ /build để xây lại.`;

export const roasts = [
  "{user} lên mạng chỉ để kiểm tra xem còn ai thức khuya hơn mình không.",
  "{user} có 3 loại tin nhắn: 'ừ', 'haha' và 'đang đi ăn'.",
  "{user} hứa 'tối nay sẽ học bài' nhiều lần đến mức lời hứa đã có hồ sơ bảo hiểm.",
  "{user} đi ngủ sớm: chuyện này xảy ra khi nào? Không ai nhớ cả.",
  "{user} nói 'mình ra ngay' nghĩa là còn 40 phút nữa.",
  "{user} mở Discord để làm việc và đóng Discord sau 4 tiếng mà việc vẫn còn nguyên.",
  "Tin đồn nói {user} đã từng đọc luật server. Chưa ai kiểm chứng được.",
];

export const roastSelf = "Tự roast chính mình là kỹ năng cao cấp, nhưng tui nhường mod làm. Chọn người khác đi.";
export const roastBot = "Roast bot hả? Tui chạy bằng điện, không có cảm xúc, nhưng tui có sổ ghi nợ.";

export const welcomeDeco = [
  "Chào mừng đến với công trường!",
  "Đội mũ bảo hộ vào, tụi tui chưa xây xong.",
];

export const guildJoinLine =
  "Thầu xây dựng đã có mặt! Server trống như ví cuối tháng thế này, gõ `/build` để tui dựng cho. Chỉ admin mới được gọi tui nhé.";

export const rulesIntro = "Luật server (đọc cho vui, vi phạm cho thật):";

export const rolesIntro = "Bấm nút để lấy hoặc bỏ role. Role không cho thêm tiền, chỉ cho thêm màu.";

export const djIntro =
  "Bot không thể tự mời bot khác (Discord cấm), nên nhờ admin bấm nút bên dưới một lần là có nhạc ngay.";

export const djMissing =
  "Admin chưa dán link bot nhạc. Nhờ admin nhét MUSIC_BOT_INVITE_URL vào cấu hình rồi chạy lại `/build`, không thì server cứ im như chùa.";

export const ttsIntro =
  "Cách dùng: vào Phòng Đọc Chữ Thành Tiếng, gõ chữ ở kênh này, bot TTS sẽ đọc to. Đừng bắt nó đọc 'a a a a a', nó có tự trọng.";

export const ttsMissing =
  "Admin chưa dán link bot TTS (TTS_BOT_INVITE_URL). Khi nào có thì kênh này mới biết nói.";
