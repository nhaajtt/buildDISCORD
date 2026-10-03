// Every line the welcome flow says, in one place so the voice is easy to adjust.
// {user} turns into a mention and {server} into the server's name.

export const welcomeDefaults = [
  "Ê {user} vừa hạ cánh xuống **{server}**! Vào rồi thì đừng im như cá chết, nói gì đi cho đỡ ngại.",
  "Chào {user}, chào mừng đến **{server}**. Cửa vào miễn phí, cửa ra phải qua thầu, và thầu đang ngủ.",
  "{user} đã xuất hiện. **{server}** vừa tăng thêm một thành viên và giảm đi một chút bình yên.",
  "Báo cáo cả nhà, {user} mới vào **{server}**. Ai có bánh tráng thì mời bạn ấy trước đi.",
  "Welcome {user}! Ở **{server}** không ai bị bỏ rơi, trừ khi bạn nhắn tin lúc ba giờ sáng.",
  "Trời ơi {user} đến **{server}** rồi! Đọc luật cho vui, chơi cho thật, đừng làm mod khóc.",
];

export const onboardingLines = {
  verifyButton: "Tui là người, không phải bot",
  verifyHint: "Bấm nút bên dưới để chứng minh bạn là người thật. Nút này chỉ bấm được bằng tài khoản của bạn thôi.",
  wrongUser: "Nút này của người mới kia, bạn bấm hộ làm gì? Tự tìm nút của mình đi, đừng ăn cơm nhà người khác.",
  verified: (userId) => `✅ <@${userId}> đã xác minh xong. Chính thức là người của server, hết quyền giả vờ lạc đường.`,
  verifyOff: "Server đã tắt xác minh rồi, nút này là hàng tồn kho. Khỏi bấm nữa.",
  verifyRoleGone: "Role xác minh đã biến mất hoặc bị đổi quyền nên thầu không dám phát. Báo admin dọn dẹp giùm.",
  verifyFailed: "Thầu thử phát role mà bị từ chối, chắc thiếu quyền Quản lý role hoặc role nằm trên thầu. Báo admin nha.",
  verifyNoMember: "Thầu không tìm thấy bạn trong server. Rời đi rồi quay lại là phải vào lại từ đầu đó.",
};

export const chaomungLines = {
  guildOnly: "Lệnh này chỉ chạy trong server, chat riêng với thầu thì chào ai bây giờ.",
  saved: (parts) => `Đã lưu cài đặt chào người mới.\n${parts.join("\n")}`,
  statusLine: (label, value) => `**${label}:** ${value}`,
  none: "chưa đặt",
  on: "bật",
  off: "tắt",
  defaultMessage: "câu chào mặc định của thầu",
  needVerifyRole: "Muốn bật xác minh thì phải chọn `vaitroxacminh` trước, không thì bấm nút xong nhận được cái nịnh.",
  noChannelNote: "Lưu ý: chưa chọn kênh và server cũng chưa có kênh hệ thống nên thầu chưa có chỗ để chào. Chọn `kenh` đi.",
  noPermsNote: "Lưu ý: thầu đang thiếu quyền Quản lý role nên chưa phát được role nào.",
  badChannel: "Kênh này không gửi tin nhắn chữ được. Chọn kênh chat bình thường hoặc kênh thông báo.",
  previewIntro: "👀 Xem trước, chỉ mình bạn thấy:",
  previewVerifyNote: "(Thành viên mới sẽ thấy thêm nút xác minh dưới tin này.)",
  previewBlocked: "Chào người mới đang tắt. Gõ `/chaomung caidat` để bật, thầu sẵn sàng đón khách.",
  disabled: "Đã tắt chào người mới. Từ nay ai vào thì tự bơi, thầu đứng nhìn.",
  alreadyDisabled: "Chào người mới vốn đang tắt rồi, tắt thêm lần nữa cũng không tắt hơn được.",
  unsafe: {
    managed: "role của bot hoặc dịch vụ khác, thầu không có quyền phát",
    everyone: "chính là @everyone, ai cũng có sẵn rồi phát làm gì",
    missing: "không tồn tại nữa",
    above: "nằm ngang hoặc trên role cao nhất của thầu, thầu với không tới",
    dangerous: (names) => `đang mang quyền nguy hiểm (${names.join(", ")}), phát cho người lạ là mời trộm vào nhà`,
  },
  unsafeRole: (label, role, reason) => `Thầu từ chối role ${label} **${role}**: ${reason}. Chọn role "hiền" hơn, chỉ nên có quyền xem và chat.`,
};

export const permLabels = {
  Administrator: "Quản trị viên",
  ManageGuild: "Quản lý server",
  ManageRoles: "Quản lý role",
  ManageChannels: "Quản lý kênh",
  ManageWebhooks: "Quản lý webhook",
  ManageMessages: "Quản lý tin nhắn",
  BanMembers: "Cấm thành viên",
  KickMembers: "Đuổi thành viên",
  ModerateMembers: "Timeout thành viên",
  MentionEveryone: "Gọi @everyone",
};
