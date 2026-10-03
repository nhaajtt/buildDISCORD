// Every line the role menus (/vaitro) say, in one place so the voice is easy to adjust.

const PERMISSION_NAMES = {
  Administrator: "Quản trị viên",
  ManageGuild: "Quản lý server",
  ManageRoles: "Quản lý role",
  ManageChannels: "Quản lý kênh",
  ManageWebhooks: "Quản lý webhook",
  ManageMessages: "Quản lý tin nhắn",
  BanMembers: "Cấm thành viên",
  KickMembers: "Đuổi thành viên",
  ModerateMembers: "Timeout thành viên",
  MentionEveryone: "Nhắc mọi người",
};

// Why a role may not go into a menu, from the code roleProblem returns
export function roleReason(roleName, problem) {
  const name = `**${String(roleName ?? "role").slice(0, 60)}**`;
  switch (problem?.code) {
    case "missing":
      return `Role ${name} không còn tồn tại.`;
    case "managed":
      return `Role ${name} do bot hoặc dịch vụ khác quản lý, thầu không phát được.`;
    case "everyone":
      return `${name} là role của tất cả mọi người, phát làm gì cho phí công.`;
    case "above":
      return `Role ${name} cao hơn hoặc bằng role cao nhất của thầu. Kéo role của bot lên trên role đó trong Cài đặt server, rồi thử lại.`;
    case "dangerous":
      return `Role ${name} có quyền nguy hiểm (${(problem.names ?? []).map((n) => PERMISSION_NAMES[n] ?? n).join(", ")}). Role tự xin không được có quyền như vậy, kẻo ai cũng thành ông chủ.`;
    default:
      return `Role ${name} không dùng được.`;
  }
}

export const lines = {
  notAdmin: "Menu role là việc của admin. Bạn cứ bấm nút trên bảng có sẵn thôi.",
  limit: (message) => message,
  badTitle: "Tiêu đề trống trơn hoặc toàn ký tự lạ. Đặt tên cho đàng hoàng.",
  badEmoji: (n) => `Emoji số ${n} Discord không nhận làm biểu tượng nút. Dùng emoji thường hoặc bỏ trống.`,
  duplicate: "Có role bị chọn hai lần. Mỗi role một lần thôi.",
  needManageRoles: "Thầu thiếu quyền Quản lý role nên không phát role được. Báo admin cấp giùm.",
  created: (id, posted, channelId) =>
    posted
      ? `✅ Menu #${id} đã đăng ở <#${channelId}>. Ai bấm nút là có role, bấm lại là bỏ.`
      : `✅ Menu #${id} đã lưu nhưng thầu chưa đăng được ở đây (thiếu quyền xem, gửi tin hoặc nhúng link). Cấp quyền rồi gõ \`/vaitro dang menu:${id}\`.`,
  posted: (id, channelId) => `✅ Đã đăng menu #${id} ở <#${channelId}>.`,
  postFailed: "Thầu không đăng được bảng ở kênh đó. Kiểm tra quyền xem kênh, gửi tin và nhúng link của bot.",
  missingMenu: "Không thấy menu số đó trong server này. Gõ `/vaitro danhsach` để xem.",
  removed: (id) => `🗑️ Đã xoá menu #${id}. Nút cũ trên bảng không còn tác dụng.`,
  listEmpty: "Chưa có menu role nào. Gõ `/vaitro tao` để làm cái đầu tiên.",
  listTitle: "🎭 Menu role",
  panelFooter: "Bấm để nhận role, bấm lại để bỏ.",
  panelFooterSingle: "Chọn một role, chọn cái khác thì role cũ tự rút.",
  selectPlaceholder: "Chọn role để nhận hoặc bỏ",
  modeSingle: "chọn một",
  modeMulti: "chọn nhiều",
  // Messages to someone pressing a button
  stale: "Menu này không còn nữa. Đừng bấm nút cũ.",
  roleNotInMenu: "Role này không còn trong menu nữa.",
  roleGone: "Role này đã bị xoá khỏi server.",
  roleUnsafe: "Role này không còn an toàn để tự xin (đã đổi quyền hoặc vị trí), thầu từ chối.",
  noPerm: "Thầu đang thiếu quyền Quản lý role nên không phát được. Báo admin giùm.",
  failed: "Discord không cho thầu đổi role lúc này. Có thể role của thầu thấp hơn role đó. Báo admin kiểm tra.",
  gave: (name) => `Đã cấp role **${name}**. Chúc mừng, bạn có thêm màu.`,
  took: (name) => `Đã bỏ role **${name}**. Bạn lại vô danh rồi.`,
  swapped: (name) => `Đã đổi sang role **${name}**, các role khác trong menu này đã rút.`,
};
