import { h } from "../dom.js";
import { busy, pickerField, switchField, textField } from "../forms.js";

const PROBLEMS = { managed: "role của bot", everyone: "@everyone", missing: "không còn", above: "cao hơn thầu", dangerous: "quyền nguy hiểm" };

export function welcomeTab({ detail, save }) {
  const s = detail.settings.welcome;
  const roles = detail.roles.map((r) => ({ id: r.id, name: r.name, note: r.unsafe ? `không dùng được: ${PROBLEMS[r.problem] ?? "không an toàn"}` : "", disabled: r.unsafe }));
  const enabled = switchField("Bật chào người mới", s.enabled);
  const channel = pickerField("Kênh đăng lời chào", detail.texts, s.channelId, { none: "Kênh hệ thống của server", prefix: "#" });
  const newbie = pickerField("Role cấp ngay khi vào server", roles, s.newbieRoleId, { none: "Không cấp role", hint: "Role có quyền nguy hiểm bị khoá, vì nó được phát cho người lạ." });
  const verify = switchField("Bật nút xác minh dưới lời chào", s.verifyEnabled);
  const verifyRole = pickerField("Role cấp sau khi bấm xác minh", roles, s.verifyRoleId, { none: "Chưa chọn" });
  const preview = h("p", { class: "preview" });
  const counter = h("span", { class: "hint" });
  const draw = (text) => {
    counter.textContent = `${text.length} / 500 ký tự`;
    preview.textContent = text.trim() ? text.replace(/\{user\}/gi, "@BạnMới").replace(/\{server\}/gi, detail.name) : "Để trống thì thầu chọn ngẫu nhiên một câu chào hài hước.";
  };
  const message = textField("Lời chào", s.message, { max: 500, multiline: true, rows: 4, hint: "Dùng {user} để nhắc người mới và {server} cho tên server.", onInput: draw });
  draw(s.message);

  const button = h("button", { class: "btn", type: "button", text: "Lưu chào mừng" });
  button.addEventListener("click", () =>
    busy(button, () =>
      save("welcome", { enabled: enabled.get(), channelId: channel.get(), newbieRoleId: newbie.get(), verifyEnabled: verify.get(), verifyRoleId: verifyRole.get(), message: message.get() }),
    ),
  );
  return h(
    "form",
    { class: "stack", onsubmit: (e) => e.preventDefault() },
    h("h2", { text: "Chào mừng" }),
    enabled.root,
    channel.root,
    newbie.root,
    message.root,
    h("div", { class: "card preview-card", "aria-live": "polite" }, h("strong", { text: "Xem trước" }), preview, counter),
    verify.root,
    verifyRole.root,
    button,
  );
}
