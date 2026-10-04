// Every line the suggestion box (/gopy) says, in one place so the voice is easy to adjust.

export const lines = {
  notAdmin: "Việc này của quản lý server. Bạn muốn góp ý thì gõ `/gopy gui`.",
  guildOnly: "Hộp góp ý chỉ có trong server thôi đại ca.",
  notSetup: "Hộp góp ý chưa được mở ở server này. Nhờ quản lý chạy `/gopy caidat`.",
  badBody: "Góp ý trống trơn hoặc toàn ký tự lạ. Nói cho đàng hoàng thầu mới ghi.",
  noChannel: "Kênh nhận góp ý không còn nữa. Nhờ quản lý đặt lại bằng `/gopy caidat`.",
  missingPerms: (names) => `Thầu thiếu quyền ${names.join(", ")} ở kênh góp ý nên không đăng được. Nhờ quản lý cấp quyền.`,
  tooFast: (sec) => `Từ từ đại ca, chờ thêm ${sec} giây rồi hãy góp ý tiếp. Thầu ghi không kịp.`,
  tooManyToday: (max) => `Hôm nay bạn đã góp ý ${max} lần rồi. Để mai thầu nghe tiếp, kẻo thầu điếc.`,
  postFailed: "Discord không cho thầu đăng góp ý lúc này. Thử lại sau chút.",
  sent: (id, channelId) => `✅ Góp ý #${id} đã lên bảng ở <#${channelId}>. Chờ bà con vote.`,
  embedTitle: (id) => `💡 Góp ý #${id}`,
  authorField: "Người góp ý",
  statusField: "Trạng thái",
  noteField: "Ghi chú của quản lý",
  status: {
    open: "Đang chờ ý kiến",
    approved: "Đã duyệt",
    rejected: "Đã từ chối",
    done: "Đã làm xong",
  },
  decidedBy: (label, userId) => `${label}, bởi <@${userId}>`,
  footer: (up, down) => `👍 ${up}  ·  👎 ${down}`,
  buttonApprove: "Duyệt",
  buttonReject: "Từ chối",
  buttonDone: "Đã làm",
  // pressing
  pressGone: "Góp ý này không còn nữa.",
  pressDecided: "Góp ý này đã chốt rồi, không bấm được nữa.",
  notStaff: "Duyệt góp ý là việc của quản lý hoặc role staff. Bạn cứ vote thôi.",
  alreadyDecided: "Có người chốt góp ý này trước bạn rồi.",
  modalTitle: (label, id) => `${label} góp ý #${id}`.slice(0, 45),
  noteLabel: "Ghi chú (không bắt buộc)",
  decidedAck: (id, label) => `Đã chốt góp ý #${id}: ${label}.`,
  dm: (id, label, body, note) =>
    `Góp ý #${id} của bạn (${body}) ${label.toLowerCase()}.${note ? ` Ghi chú: ${note}` : ""}`,
  // admin side
  settingsShow: (s) =>
    `Hộp góp ý: ${s.enabled ? "đang bật" : "đang tắt"}\nKênh: ${s.channelId ? `<#${s.channelId}>` : "chưa đặt"}\nRole staff: ${s.staffRoleId ? `<@&${s.staffRoleId}>` : "chưa đặt (chỉ người có quyền Quản lý server)"}`,
  settingsSaved: (s) => `✅ Đã lưu.\n${lines.settingsShow(s)}`,
  needChannelFirst: "Phải đặt kênh nhận góp ý trước khi bật. Chạy lại với `kenh`.",
  channelWarn: (names) => `Lưu ý: thầu đang thiếu quyền ${names.join(", ")} ở kênh đó, cấp thêm kẻo không đăng được.`,
  listEmpty: "Không có góp ý nào đang mở. Dân tình hiền khô.",
  listTitle: "💡 Góp ý đang mở",
  missing: "Không thấy góp ý số đó trong server này. Gõ `/gopy danhsach` để xem.",
  removed: (id) => `🗑️ Đã gỡ góp ý #${id}.`,
};
