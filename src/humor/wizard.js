// Every line the setup wizard, /trogiup and the plan table say, in one place so the voice is easy to adjust.

export const SITE_URL = "https://builddiscord.vercel.app";
export const HANDBOOK_URL = "https://github.com/nhaajtt/buildDISCORD/blob/main/docs/so-tay.md";

export const wizardLines = {
  guildOnly: "Lệnh này chỉ chạy trong server, chat riêng với thầu thì dựng được cái gì.",
  welcomeTitle: "🏗️ Thầu đã tới công trường",
  welcomeBody: "Server của bạn đang trống như ví cuối tháng. Bấm nút bên dưới, chọn vài ô, một cú bấm nữa là xong cả server, có điểm sức khỏe trước và sau cho bạn khoe. Chỉ admin bấm được nhé.",
  startButton: "Bắt đầu",
  openRefused: "Nút này chỉ dành cho admin. Gọi admin tới bấm giùm, thầu không nhận lệnh từ người lạ.",
  alreadyDone: "Server này thầu đã dọn xong một lần rồi. Chạy lại cũng được, thầu bỏ qua phần đã có, không dựng trùng đâu.",
  title: "🏗️ Dựng server trong 60 giây",
  intro: "Chọn ba thứ bên dưới rồi bấm **Dựng luôn**. Muốn đổi ý cứ chọn lại, chưa có gì bị đụng tới cho đến khi bạn bấm nút.",
  themeMenu: "1. Server của bạn thuộc kiểu nào?",
  humorMenu: "2. Giọng điệu của luật và lời chào",
  extrasMenu: "3. Bật thêm gì cho tiện?",
  suggestOption: "Gợi ý cho tôi",
  suggestDescription: "Gõ vài chữ tả server, thầu chọn giúp",
  goButton: "Dựng luôn",
  cancelButton: "Thôi",
  cancelled: "Ok, huỷ. Khi nào sẵn sàng thì gõ `/batdau` lại, thầu vẫn ở đây.",
  expired: "Bản chọn này hết hạn rồi, hoặc không phải của bạn. Gõ `/batdau` để mở lại.",
  notAdmin: "Chỉ admin mới được gọi thầu dựng server. Nhờ admin gõ `/batdau` giùm nhé.",
  busy: "Công trình này đang thi công, đừng giục. Giục là chậm hơn.",
  modalTitle: "Tả server của bạn",
  modalLabel: "Server này để làm gì? (vài chữ là đủ)",
  modalPlaceholder: "ví dụ: nhóm bạn chơi game cuối tuần",
  suggested: (label, matched) => `💡 Thầu gợi ý **${label}**${matched.length ? ` (nghe có mùi: ${matched.join(", ")})` : ""}. Không ưng thì chọn lại ở ô dưới.`,
  suggestedGuess: (label) => `💡 Mô tả hơi ít chữ nên thầu đoán **${label}**, kiểu nào cũng ổn để bắt đầu. Không ưng thì chọn lại ở ô dưới.`,
  mixLocked: "Trộn nhiều theme là của gói Pro, thầu giữ lại theme đầu tiên bạn chọn. Gõ `/dungthu` để thử Pro 7 ngày miễn phí.",
  humorLocked: "Đổi giọng điệu là của gói Pro, gói miễn phí được giọng troll thôi. Gõ `/dungthu` để thử Pro 7 ngày miễn phí.",
  pickTheme: "Chưa chọn kiểu server, chọn ở ô đầu tiên trước đã.",
  progressStart: "🩺 Khám sức khỏe server trước khi làm...",
  progressExtras: "⚙️ Bật các tính năng bạn chọn...",
  progressAfter: "🩺 Khám lại để xem điểm lên bao nhiêu...",
  failed: (message) => `💥 Công trình sập giữa chừng: ${String(message).slice(0, 200)}\nBấm \`/batdau\` chạy lại được, thầu sẽ bỏ qua phần đã xây.`,
  skippedBuild: "Đã xây đúng theme này rồi, thầu bỏ qua bước dựng và chỉ kiểm tra lại phần còn lại.",
  built: (c) => `Dựng xong ${c.categories} danh mục, ${c.channels} kênh, ${c.roles} role (phần đã có thì giữ nguyên)`,
  shareButton: "Đăng thẻ khoe lên kênh",
  shared: "Đã đăng thẻ lên kênh. Khoe vừa thôi nha đại ca.",
  shareDone: "Thẻ đã đăng rồi, đăng nữa là spam.",
  shareFailed: "Thầu không đăng được thẻ ở kênh này, chắc thiếu quyền gửi tin. Chụp màn hình khoe tạm vậy.",
  siteButton: "Trang chủ thầu",
};

export const extraLabels = {
  welcome: { label: "Chào người mới", description: "Lời chào ở sảnh chờ mỗi khi có người vào" },
  automod: { label: "AutoMod nhẹ", description: "Chặn spam và tag bừa bằng AutoMod của Discord" },
  health: { label: "Khám sức khỏe hằng tuần", description: "Chấm điểm server mỗi tuần và báo về kênh mod" },
  security: { label: "Bảo vệ cơ bản", description: "Báo động khi có đợt raid, ghi nhật ký phạt" },
  digest: { label: "Bản tin tuần", description: "Mỗi tuần một bản tóm tắt gửi kênh mod" },
};

export const extraDone = {
  welcome: "Chào người mới đã bật",
  automod: "AutoMod nhẹ đã bật",
  health: "Khám sức khỏe hằng tuần đã bật",
  security: "Bảo vệ cơ bản đã bật",
  digest: "Bản tin tuần đã bật",
};

export const extraProblems = {
  automodPerms: "AutoMod: thầu thiếu quyền Quản lý server nên chưa dựng được luật. Cấp quyền rồi gõ `/automod bat`",
  automodOther: "AutoMod: Discord từ chối dựng luật. Thử lại bằng `/automod bat` sau",
  welcomeNoChannel: "Chào người mới: chưa tìm được kênh chào, gõ `/chaomung caidat` để chọn kênh",
  noLogChannel: "Chưa có kênh mod để gửi nhật ký, gõ lệnh của từng tính năng để chọn kênh",
  nukeGuardOff: "chống xoá hàng loạt cần gói Pro",
};

export const prideLines = {
  big: (before, after) => `Từ ${before} lên ${after} điểm chỉ trong một buổi. Đối thủ còn đang đọc hướng dẫn.`,
  small: (before, after) => `Nhích từ ${before} lên ${after} điểm. Ít mà chắc, thầu làm nghề tử tế.`,
  same: (score) => `Server giữ ${score} điểm, vừa gọn gàng vừa an toàn, thầu hài lòng.`,
  unknown: "Server dựng xong trong một cú bấm. Không ai phải ngồi chỉnh tay từng kênh.",
};

export const nextStepCandidates = [
  { key: "khamsuckhoe", text: "Gõ `/khamsuckhoe kiemtra` xem chi tiết điểm và bấm sửa an toàn" },
  { key: "chaomung", text: "Gõ `/chaomung thu` xem trước lời chào người mới" },
  { key: "ticket", text: "Gõ `/ticket caidat` mở bàn hỗ trợ cho thành viên", need: "tickets" },
  { key: "diemdanh", text: "Gõ `/diemdanh` để thử mini-game điểm danh", need: "games" },
  { key: "dungthu", text: "Gõ `/dungthu` dùng thử Pro 7 ngày miễn phí để mở khoá thêm", onlyFree: true },
  { key: "goi", text: "Gõ `/goi` xem bảng gói và những gì đang bị khoá" },
  { key: "trogiup", text: "Gõ `/trogiup` xem toàn bộ lệnh, chia theo nhóm" },
];

export const cardLines = {
  title: "🏗️ Server đã được thầu dựng xong",
  before: "Điểm trước",
  after: "Điểm sau",
  setup: "Đã làm",
  next: "Thử ngay",
  footer: `Dựng bằng Thầu Xây Dựng, ${SITE_URL}`,
  none: "Chưa có gì thêm",
};

export const helpLines = {
  title: "🧰 Thầu làm được gì",
  how: [
    "1. Gõ `/batdau`, chọn kiểu server và vài ô, bấm **Dựng luôn**.",
    "2. Xem điểm sức khỏe tăng, bấm đăng thẻ khoe nếu thích.",
    "3. Cần gì thêm thì xem danh sách dưới đây, chỗ nào ghi khoá là của gói cao hơn.",
  ],
  howTitle: "Bắt đầu trong ba dòng",
  lockedPrefix: "🔒",
  lockedHint: (planName) => `gói ${planName}`,
  footer: "Chi tiết từng lệnh nằm trong sổ tay",
  handbookButton: "Mở sổ tay",
  groupTitles: { build: "🏗️ Dựng server", protect: "🛡️ Bảo vệ", engage: "🎉 Giữ server sôi động", business: "💼 Gói và thanh toán", other: "📎 Khác" },
};

// plan: the flag in the plan that unlocks the item (omitted when every plan has it); hint: shown after a lock
export const helpItems = [
  { group: "build", name: "batdau", text: "dựng cả server bằng một cú bấm" },
  { group: "build", name: "build", text: "chọn theme, trộn theme", lockedNote: "trộn nhiều theme", flag: "mix", partial: true },
  { group: "build", name: "thietke", text: "AI thiết kế server riêng", flag: "aiPerMonth" },
  { group: "build", name: "theme", text: "lưu và dùng lại theme riêng", flag: "customThemes" },
  { group: "build", name: "backup", text: "sao lưu và khôi phục cấu trúc", flag: "backups" },
  { group: "build", name: "nuke", text: "đập những gì thầu đã xây" },
  { group: "protect", name: "khamsuckhoe", text: "chấm điểm sức khỏe, sửa an toàn" },
  { group: "protect", name: "automod", text: "AutoMod chặn spam, mức gắt", flag: "automodFull", partial: true },
  { group: "protect", name: "chaomung", text: "chào người mới, nút xác minh" },
  { group: "protect", name: "ticket", text: "bàn hỗ trợ bằng kênh riêng", flag: "tickets" },
  { group: "engage", name: "diemdanh", text: "điểm danh mỗi ngày", flag: "games" },
  { group: "engage", name: "cauhoi", text: "câu hỏi nhanh lấy điểm", flag: "games" },
  { group: "engage", name: "doanso", text: "trò đoán số", flag: "games" },
  { group: "engage", name: "thachdau", text: "thách đấu kéo búa bao", flag: "games" },
  { group: "engage", name: "bangxephang", text: "bảng xếp hạng điểm vui", flag: "games" },
  { group: "engage", name: "sukien", text: "sự kiện định kỳ", flag: "events" },
  { group: "protect", name: "khoakhan", text: "khoá server khi bị raid, chống xoá hàng loạt" },
  { group: "protect", name: "canhcao", text: "cảnh cáo thành viên, lưu hồ sơ" },
  { group: "protect", name: "timeout", text: "cho nghỉ chat có thời hạn" },
  { group: "protect", name: "kick", text: "đuổi thành viên ra khỏi server" },
  { group: "protect", name: "ban", text: "cấm thành viên, có thể xoá tin gần đây" },
  { group: "protect", name: "hoso", text: "xem hồ sơ vi phạm của một người" },
  { group: "engage", name: "hang", text: "cấp độ theo hoạt động chat và giọng nói", flag: "activity" },
  { group: "engage", name: "vaitro", text: "menu nhận role bằng nút", flag: "roleMenus" },
  { group: "engage", name: "quatang", text: "giveaway có chọn người thắng", flag: "giveaways" },
  { group: "engage", name: "binhchon", text: "bình chọn bằng nút" },
  { group: "build", name: "vietgiup", text: "viết luật, lời chào, thông báo giúp bạn", flag: "aiHelper" },
  { group: "engage", name: "roast", text: "đá đểu bạn bè cho vui" },
  { group: "business", name: "goi", text: "xem gói của server" },
  { group: "business", name: "dungthu", text: "dùng thử Pro 7 ngày, mỗi server một lần" },
  { group: "business", name: "mua", text: "mua hoặc gia hạn gói" },
  { group: "business", name: "kichhoat", text: "nhập mã kích hoạt" },
  { group: "business", name: "xoadulieu", text: "xoá dữ liệu của server khỏi thầu" },
];

export const planLines = {
  title: "🏗️ Gói dịch vụ của thầu",
  prices: [
    "**Pro**: 3,99 đô mỗi 30 ngày. **Plus**: 7,99 đô mỗi 30 ngày. Mua một năm chỉ trả 10 tháng, tặng 2 tháng.",
    "**Dựng giúp**: 4,99 đô trả một lần, nhận 7 ngày Pro, đủ để dựng và cài xong server.",
    "`/dungthu`: dùng thử Pro 7 ngày miễn phí, mỗi server một lần duy nhất.",
  ],
  buy: "Mua nhanh bằng `/mua` (thanh toán xong gói tự bật), hoặc gõ `/kichhoat` nếu đã có mã.",
};

// What the wizard's own pieces look like in the plan table
export const planFlagLabels = {
  security: "bảo vệ chống raid",
  nukeGuard: "chống xoá hàng loạt",
  activity: "điểm hoạt động",
  giveaways: "giveaway",
  digest: "bản tin tuần",
  aiHelper: "trợ lý AI",
};
