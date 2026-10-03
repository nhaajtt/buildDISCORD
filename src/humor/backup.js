// Every line the backup and saved-theme commands say, in one place so the voice is easy to adjust.

export const backupLines = {
  badName: "Tên bản sao lưu phải dài từ 1 đến 40 ký tự. Đặt tên như đặt tên con, nhưng ngắn hơn.",
  nameTaken: "Tên này có bản sao lưu rồi. Xoá bản cũ hoặc đặt tên khác, thầu không dám đè lên kỷ niệm.",
  empty: "Chưa có bản sao lưu nào. Gõ `/backup tao` để chụp lại server trước khi ai đó làm loạn.",
  notFound: "Không thấy bản sao lưu tên đó. Gõ `/backup danhsach` xem thầu đang giữ những gì.",
  tooBig: "Server này to quá bản sao lưu không nhét vừa (tối đa 250 role và 500 kênh, tổng không quá 400 KB). Dọn bớt rồi thử lại.",
  noMissing: "Mọi thứ trong bản sao lưu này đều đã có trên server rồi. Không có gì để khôi phục, thầu nghỉ tay.",
  busy: "Thầu đang bận thi công ở server này, đừng giục. Giục là chậm hơn.",
  cancelled: "Ok, huỷ. Chưa có gì bị đụng tới.",
  expired: "Nút này cũ rồi hoặc không phải của bạn. Gõ lại lệnh cho thầu.",
  fileProblem: "Tệp này thầu không đọc được. Cần một tệp .json do `/backup xuat` tạo ra, dưới 400 KB.",
  notBackup: "Tệp này không phải bản sao lưu hợp lệ nên thầu từ chối. Thầu cẩn thận có lý do.",
  imported: (name, counts) =>
    `Đã nhập bản sao lưu **${name}**: ${counts.roles} role, ${counts.categories} danh mục, ${counts.channels} kênh. Khôi phục bằng \`/backup khoiphuc\`.`,
  created: (name, counts) =>
    `📸 Đã chụp server vào bản sao lưu **${name}**: ${counts.roles} role, ${counts.categories} danh mục, ${counts.channels} kênh. Giờ có ai phá thì cũng có chỗ quay về.`,
  deleted: (name) => `Đã xoá bản sao lưu **${name}**.`,
  restoring: "♻️ Đang khôi phục, tránh xa công trường...",
  restoreDone: (created) =>
    `✅ Khôi phục xong: thêm ${created.roles} role, ${created.categories} danh mục, ${created.channels} kênh. Cái gì đã có thì thầu để yên, \`/nuke\` biết đập đúng phần vừa tạo.`,
  restoreFailed: (message) => `💥 Khôi phục dừng giữa chừng: ${message}\nPhần đã tạo vẫn được ghi lại, chạy lại lệnh sẽ bỏ qua phần đã có.`,
  foreignNote:
    "Bản sao lưu này đến từ server khác nên thầu cắt bớt các quyền nhạy cảm (quản lý server, role, kênh, webhook, ban, kick, @everyone) khỏi role khôi phục.",
  adminNote: "Quyền Administrator không bao giờ được khôi phục, từ bản nào cũng vậy.",
};

export const themeLines = {
  badName: "Tên theme phải dài từ 1 đến 40 ký tự.",
  empty: "Chưa lưu theme riêng nào. Mở bản vẽ rồi bấm **Lưu thành theme riêng** nhé.",
  notFound: "Không thấy theme riêng tên đó. Gõ `/theme danhsach` xem thầu đang giữ những gì.",
  nothingToSave: "Bản vẽ này không còn gì riêng để lưu (chỉ còn phần chung của mọi server). Thêm danh mục hay kênh của bạn rồi lưu.",
  saved: (name, replaced) => (replaced ? `Đã ghi đè theme riêng **${name}**.` : `Đã lưu theme riêng **${name}**.`),
  deleted: (name) => `Đã xoá theme riêng **${name}**.`,
  cancelled: "Ok, huỷ. Theme vẫn còn nguyên.",
  expired: "Nút này cũ rồi hoặc không phải của bạn. Gõ lại lệnh cho thầu.",
  fileProblem: "Tệp này thầu không đọc được. Cần một tệp .json do `/theme xuat` tạo ra, dưới 100 KB.",
  notTheme: "Tệp này không phải theme hợp lệ nên thầu từ chối.",
  imported: (name) => `Đã nhập theme riêng **${name}**. Dùng bằng \`/theme dung\`.`,
  exportHint: "Tệp theme của bạn đây. Gửi cho bạn bè rồi họ `/theme nhap` là có ngay.",
};
