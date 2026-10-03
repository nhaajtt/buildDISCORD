// Every line the server health check says, in one place so the voice is easy to adjust.

export const gradeBands = [
  { min: 90, label: "Chắc như bê tông, hacker nhìn cũng nản" },
  { min: 75, label: "Ổn áp, chỉ còn vài cái lỗ nhỏ cho chuột chui" },
  { min: 55, label: "Tạm được, nhưng cửa sau đang hé" },
  { min: 35, label: "Báo động vàng, mod đừng ngủ nữa" },
  { min: 0, label: "Server này là cái nhà không có cửa" },
];

export const severityIcons = { cao: "🔴", vua: "🟡", thap: "🟢" };

export const permLabels = {
  Administrator: "Quản trị viên",
  ManageGuild: "Quản lý server",
  ManageRoles: "Quản lý role",
  ManageChannels: "Quản lý kênh",
  ManageWebhooks: "Quản lý webhook",
  ManageMessages: "Quản lý tin nhắn",
  KickMembers: "Đuổi thành viên",
  BanMembers: "Cấm thành viên",
  MentionEveryone: "Gọi @everyone",
  ModerateMembers: "Timeout thành viên",
};

export const verificationLabels = ["Không có", "Thấp", "Trung bình", "Cao", "Rất cao"];

const list = (names, max = 5) => (names.length > max ? `${names.slice(0, max).join(", ")} và ${names.length - max} cái nữa` : names.join(", "));

export const findingTexts = {
  everyoneDangerous: (perms) => ({
    title: "@everyone đang cầm quyền nguy hiểm",
    detail: `Ai vào server cũng được ${list(perms)}. Đây là tặng chìa khóa nhà cho cả khu phố, gỡ ngay.`,
  }),
  manyAdmins: (names) => ({
    title: `Có ${names.length} role Administrator`,
    detail: `${list(names)}. Admin nhiều quá thì ai làm gì cũng không biết là ai làm, nên giữ tối đa ba role.`,
  }),
  noModerator: {
    title: "Không có role nào đủ sức làm mod",
    detail: "Không role nào (ngoài bot) có quyền Timeout, Đuổi hoặc Quản lý tin nhắn. Có người quậy thì chỉ biết ngồi nhìn thôi.",
  },
  verificationNone: {
    title: "Mức xác minh đang là Không có",
    detail: "Tài khoản vừa tạo một phút cũng chat được. Nâng lên Trung bình để bọn spam phải đợi 5 phút cho đỡ hăng.",
  },
  filterOff: {
    title: "Bộ lọc nội dung nhạy cảm đang tắt",
    detail: "Ảnh lạ gửi vào server không ai quét. Bật quét cho mọi thành viên cho đỡ phải rửa mắt.",
  },
  mfaOff: {
    title: "Mod chưa bắt buộc 2FA",
    detail: "Tài khoản mod bị hack thì kẻ gian có luôn quyền mod. Bật yêu cầu 2FA trong cài đặt server (chỉ chủ server bật được).",
  },
  noRules: {
    title: "Chưa có kênh luật",
    detail: "Không có luật thì làm sao nói người ta vi phạm. Tạo kênh luật và đặt làm kênh Quy tắc của cộng đồng.",
  },
  noSystemChannel: {
    title: "Chưa có kênh chào mừng hay kênh hệ thống",
    detail: "Người mới vào không ai chào, buồn như quán vắng. Đặt kênh hệ thống trong cài đặt server.",
  },
  announceWritable: (names) => ({
    title: "Kênh thông báo ai cũng gõ được",
    detail: `${list(names)}: @everyone được gửi tin nhắn. Thông báo mà ai cũng đăng thì thành chợ trời.`,
  }),
  emptyCategories: (names) => ({
    title: `${names.length} danh mục trống trơn`,
    detail: `${list(names)}. Danh mục không có kênh giống phòng đóng cửa, xóa đi cho gọn.`,
  }),
  voiceOutside: (names) => ({
    title: "Kênh thoại đứng ngoài danh mục",
    detail: `${list(names)} đang lang thang không thuộc danh mục nào. Gom vào cho server có trật tự.`,
  }),
  duplicateNames: (names) => ({
    title: "Có kênh trùng tên",
    detail: `${list(names)}. Hai kênh cùng tên là cách nhanh nhất để thành viên đăng nhầm chỗ.`,
  }),
  roleCount: (count) => ({
    title: `Role sắp chạm trần (${count}/250)`,
    detail: "Discord chỉ cho 250 role. Dọn bớt role không ai dùng trước khi hết chỗ.",
  }),
  channelCount: (count) => ({
    title: `Kênh sắp chạm trần (${count}/500)`,
    detail: "Discord chỉ cho 500 kênh (danh mục tính luôn). Gộp hoặc xóa bớt kênh chết đi.",
  }),
  roleAboveMods: (names) => ({
    title: "Role quyền cao đứng trên cả mod",
    detail: `${list(names)} mang quyền nguy hiểm mà xếp trên mọi role mod, nên mod không quản được. Hạ xuống dưới mod.`,
  }),
};

export const auditLines = {
  guildOnly: "Khám sức khỏe cần có server mới khám được, chat riêng thì thầu chỉ khám được lương tâm.",
  working: "🩺 Thầu đang soi từng role, từng kênh. Đừng thở mạnh...",
  failed: "Máy khám bị hỏng giữa chừng, thầu chưa đọc hết server. Thử lại sau chút nha.",
  clean: "Không bắt được lỗi nào. Thầu hơi nghi ngờ nhưng thôi, khen một câu.",
  expired: "Nút này cũ rồi hoặc không phải của bạn. Gõ lại lệnh cho thầu.",
  noReport: "Thầu chưa có kết quả khám nào, gõ `/khamsuckhoe kiemtra` trước đã.",
  noFixes: "Không còn gì sửa an toàn được nữa, hoặc có ai sửa giùm rồi. Gõ lại lệnh để khám lại.",
  cancelled: "Ok, huỷ. Chưa có gì bị đụng tới.",
  fixIntro: "Thầu sẽ làm đúng những việc sau, không hơn không kém:",
  fixOutro: "Thầu không đụng tới role nào khác và không cấp thêm quyền cho ai. Bấm xác nhận để làm.",
  fixConfirm: "Xác nhận sửa",
  fixSkipped: (title) => `⏭️ ${title}: đã được sửa trước đó, bỏ qua.`,
  fixFailed: (title) => `❌ ${title}: thầu bị từ chối, chắc thiếu quyền (Quản lý role hoặc Quản lý server) hoặc role @everyone nằm trên thầu.`,
  fixDone: (lines, before, after) => `${lines.join("\n")}\n\nĐiểm sức khỏe: ${before} thành ${after}.`,
  unknownFix: "Thầu không biết cách sửa cái này, nên không đụng vào.",
  historyEmpty: "Chưa khám lần nào nên chưa có xu hướng gì để kể. Gõ `/khamsuckhoe kiemtra` đi.",
  historyTitle: "📈 Năm lần khám gần nhất",
  trendUp: (diff) => `Tăng ${diff} điểm so với lần cũ nhất trong danh sách. Giỏi, server đang lên đời.`,
  trendDown: (diff) => `Giảm ${diff} điểm so với lần cũ nhất trong danh sách. Ai vừa mở cửa sau vậy?`,
  trendFlat: "Điểm đứng yên. Ổn định, hoặc là chưa ai chịu sửa gì.",
  trendSingle: "Mới có một lần khám, chưa vẽ nổi đường xu hướng.",
  footer: "Chỉ đọc cấu trúc server, không đọc tin nhắn. Sửa gì cũng phải bấm xác nhận.",
  moreFindings: (n) => `...còn ${n} mục nữa, bấm Xem hết.`,
  fixLabels: {
    "strip-everyone": (perms) => `Gỡ quyền ${perms.join(", ")} khỏi @everyone`,
    "verification-medium": (from) => `Nâng mức xác minh từ ${from} lên Trung bình`,
    "content-filter": () => "Bật bộ lọc nội dung nhạy cảm cho mọi thành viên",
  },
  fixTitles: {
    "strip-everyone": "Gỡ quyền nguy hiểm của @everyone",
    "verification-medium": "Nâng mức xác minh",
    "content-filter": "Bật bộ lọc nội dung",
  },
  fixDoneLines: {
    "strip-everyone": (perms) => `✅ Đã gỡ ${perms.join(", ")} khỏi @everyone.`,
    "verification-medium": () => "✅ Đã nâng mức xác minh lên Trung bình.",
    "content-filter": () => "✅ Đã bật bộ lọc nội dung cho mọi thành viên.",
  },
};
