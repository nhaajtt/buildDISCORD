import { h } from "../dom.js";
import { busy, notice, pickerField, switchField } from "../forms.js";

export function suggestTab({ detail, save }) {
  const s = detail.settings.suggest;
  const enabled = switchField("Bật góp ý", s.enabled, { hint: "Thành viên gõ lệnh góp ý, ý kiến được đăng ở kênh bên dưới kèm nút bình chọn." });
  const channel = pickerField("Kênh đăng góp ý", detail.texts, s.channelId, { none: "Chưa chọn kênh", prefix: "#", hint: "Thầu cần quyền xem kênh, gửi tin, nhúng link và thêm biểu cảm ở đó." });
  const staff = pickerField("Role duyệt góp ý", detail.roles, s.staffRoleId, { none: "Chỉ người quản lý server", hint: "Role này được chấp nhận hoặc từ chối góp ý." });
  const button = h("button", { class: "btn", type: "button", text: "Lưu cài đặt góp ý" });
  button.addEventListener("click", () => busy(button, () => save("suggest", { enabled: enabled.get(), channelId: channel.get(), staffRoleId: staff.get() })));
  const open = detail.overview.counts.suggestionsOpen;
  return h("form", { class: "stack", onsubmit: (e) => e.preventDefault() }, h("h2", { text: "Góp ý" }), notice(`Hiện có ${open} góp ý đang chờ duyệt.`), enabled.root, channel.root, staff.root, button);
}
