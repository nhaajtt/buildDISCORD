// Every line the weekly report, the health alert and the plan reminders say, in one place so the voice is easy to adjust.

export const digestLines = {
  title: "📋 Báo cáo tuần của thầu",
  previewTitle: "📋 Báo cáo tuần (bản gửi thử)",
  intro: (name) => `Thầu đi một vòng công trình **${name}** và ghi sổ lại. Chỉ đếm số, không đọc tin nhắn của ai hết.`,
  joins: "Người mới vào",
  ticketsOpened: "Ticket đã mở",
  ticketsClosed: "Ticket đã đóng",
  automod: "Tin bị AutoMod chặn",
  health: "Sức khoẻ server",
  healthNow: (score) => `**${score}/100**`,
  healthNoData: "Chưa khám được lần nào",
  healthUp: (now, diff) => `**${now}/100** (tăng ${diff} điểm so với tuần trước, giỏi)`,
  healthDown: (now, diff) => `**${now}/100** (tụt ${diff} điểm so với tuần trước, coi chừng)`,
  healthFlat: (now) => `**${now}/100** (y như tuần trước)`,
  healthFirst: (now) => `**${now}/100** (lần đầu thầu ghi sổ, tuần sau có cái so)`,
  suggestions: "Thầu đề xuất",
  allGood: "Không có gì cần sửa gấp. Thầu ngồi uống trà.",
  tipHealth: "Gõ `/khamsuckhoe kiemtra` để xem chi tiết các lỗ hổng.",
  tipAutomod: "AutoMod đang tắt. Gõ `/automod bat` cho thầu dựng luật chặn spam.",
  tipTickets: (n) => `Đang có ${n} ticket mở. Nhắc staff dọn bớt cho khách đỡ chờ.`,
  tipJoinsHigh: (n) => `Tuần này vào tận ${n} người. Nhớ kiểm tra kênh chào mừng và luật cho gọn.`,
  fixButton: (title) => `Sửa: ${title}`.slice(0, 80),
  footer: "Chỉnh lịch gửi trong bảng điều khiển hoặc tắt bằng mục Báo cáo tuần.",
  footerPreview: "Đây là bản gửi thử, không tính vào lịch hằng tuần.",
  joinNote: "Lượt vào đếm theo thông báo chào của Discord, nếu tắt thông báo đó thì số có thể thấp hơn thật.",
};

export const alertLines = {
  title: "🚨 Điểm sức khoẻ server tụt mạnh",
  description: (before, after) => `Tuần trước **${before}/100**, giờ chỉ còn **${after}/100**. Tụt ${before - after} điểm là có chuyện, thầu báo để đại ca xử lý sớm.`,
  topFindings: "Mấy chỗ đáng lo nhất",
  fixHint: "Bấm nút bên dưới để xem thầu sẽ sửa gì, đại ca duyệt rồi mới làm.",
  noFix: "Không có cách sửa tự động an toàn nào, gõ `/khamsuckhoe kiemtra` để xem từng lỗi.",
  footer: "Khám định kỳ mỗi tuần. Tắt trong bảng điều khiển, mục Báo cáo tuần.",
};

export const planLines = {
  soon: (label, days, whenTs) => ({
    title: `⏰ Gói ${label} sắp hết hạn`,
    description: `Gói **${label}** của server còn khoảng ${days} ngày nữa (hết hạn <t:${whenTs}:F>). Hết hạn thì các tính năng Pro tự tắt, dữ liệu vẫn giữ nguyên.\nGia hạn bằng \`/mua\` hoặc \`/goi\`, mã mới sẽ cộng thêm ngày vào sau hạn cũ.`,
  }),
  ended: (label) => ({
    title: `📴 Gói ${label} đã hết hạn`,
    description: `Gói **${label}** của server vừa hết hạn, server về gói miễn phí. Cài đặt vẫn còn, chỉ các tính năng trả phí tạm nghỉ.\nMuốn quay lại thì gõ \`/mua\` hoặc \`/goi\`, thầu chờ.`,
  }),
  footer: "Nhắc một lần thôi, thầu không làm phiền.",
};

export const permLabels = {
  ViewChannel: "Xem kênh",
  SendMessages: "Gửi tin nhắn",
  EmbedLinks: "Nhúng liên kết",
};

export const fixFlowLines = {
  notAdmin: "Nút này dành cho admin của server, bạn chưa đủ quyền.",
  guildOnly: "Nút này chỉ chạy trong server.",
  expired: "Nút này không còn hợp lệ hoặc không phải của bạn. Gọi lại từ đầu nhé.",
  nothing: "Chỗ này không còn gì để sửa, ai đó sửa rồi hoặc server đã ổn.",
  intro: "Thầu sẽ làm đúng những việc này, chỉ bớt rủi ro, không cấp thêm quyền gì:",
  outro: "Duyệt thì bấm nút đỏ, không thì thôi.",
  confirm: "Duyệt, sửa đi thầu",
  cancel: "Thôi để tui nghĩ lại",
  cancelled: "Ok, thầu không đụng gì hết.",
  failed: (title) => `Thầu sửa "${title}" không được, có thể thiếu quyền. Cấp quyền cho bot rồi thử lại.`,
  done: (summary, before, after) => `${summary}\nĐiểm sức khoẻ: ${before} thành ${after}.`,
};
