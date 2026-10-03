import { h } from "../dom.js";
import { busy, notice, numberField, pickerField, switchField } from "../forms.js";

const DAYS = [
  { id: "1", name: "Thứ Hai" },
  { id: "2", name: "Thứ Ba" },
  { id: "3", name: "Thứ Tư" },
  { id: "4", name: "Thứ Năm" },
  { id: "5", name: "Thứ Sáu" },
  { id: "6", name: "Thứ Bảy" },
  { id: "0", name: "Chủ nhật" },
];

export function digestTab({ detail, save, previewDigest }) {
  const s = detail.settings.digest;
  const enabled = switchField("Bật báo cáo tuần", s.enabled, { hint: "Mỗi tuần thầu gửi một bản tóm tắt: người mới vào, ticket, tin bị AutoMod chặn, điểm sức khoẻ và việc nên làm. Chỉ có số liệu, không có nội dung tin nhắn." });
  const channel = pickerField("Kênh nhận báo cáo", detail.texts, s.channelId, { none: "Chưa chọn", prefix: "#" });
  const day = pickerField("Gửi vào ngày", DAYS, String(s.weekday), { none: "Thứ Hai", hint: "Giờ theo múi giờ của bot." });
  const hour = numberField("Lúc mấy giờ (0 đến 23)", s.hour, { min: 0, max: 23 });
  const audit = switchField("Khám sức khoẻ mỗi tuần và báo khi điểm tụt từ 10 điểm", s.auditWeekly, { hint: "Điểm tụt mạnh thì thầu báo ở kênh trên kèm nút sửa an toàn." });

  const button = h("button", { class: "btn", type: "button", text: "Lưu lịch báo cáo" });
  button.addEventListener("click", () =>
    busy(button, () =>
      save("digest", { enabled: enabled.get(), channelId: channel.get(), weekday: Number(day.get() ?? "1"), hour: hour.get(), auditWeekly: audit.get() }),
    ),
  );

  const preview = h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Gửi thử bây giờ" });
  preview.addEventListener("click", () => busy(preview, () => previewDigest()));

  return h(
    "form",
    { class: "stack", onsubmit: (e) => e.preventDefault() },
    h("h2", { text: "Báo cáo tuần" }),
    s.lastSentAt ? notice(`Lần gửi gần nhất: ${new Date(s.lastSentAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}.`, "info") : null,
    enabled.root,
    channel.root,
    day.root,
    hour.root,
    audit.root,
    h("div", { class: "row" }, button, preview),
    h("p", { class: "hint", text: "Gửi thử dùng kênh đã lưu và không tính vào lịch hằng tuần. Lưu cài đặt trước rồi hãy gửi thử." }),
  );
}
