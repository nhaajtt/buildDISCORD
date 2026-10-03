import { h } from "../dom.js";
import { busy, pickerField, switchField } from "../forms.js";

export function modlogTab({ detail, save }) {
  const s = detail.settings.modlog;
  const enabled = switchField("Bật nhật ký quản trị", s.enabled, { hint: "Thầu ghi lại ai bị cấm, cho nghỉ chat, đổi role và tin bị AutoMod chặn. Chỉ ghi việc đã xảy ra, không chép nội dung tin nhắn." });
  const channel = pickerField("Kênh ghi nhật ký", detail.texts, s.channelId, { none: "Chưa chọn", prefix: "#" });
  const bans = switchField("Cấm và gỡ cấm", s.logBans);
  const timeouts = switchField("Cho nghỉ chat (timeout)", s.logTimeouts);
  const roles = switchField("Đổi role của thành viên", s.logRoles);
  const automod = switchField("Tin bị AutoMod chặn", s.logAutomod);

  const button = h("button", { class: "btn", type: "button", text: "Lưu nhật ký" });
  button.addEventListener("click", () =>
    busy(button, () =>
      save("modlog", { enabled: enabled.get(), channelId: channel.get(), logBans: bans.get(), logTimeouts: timeouts.get(), logRoles: roles.get(), logAutomod: automod.get() }),
    ),
  );
  return h("form", { class: "stack", onsubmit: (e) => e.preventDefault() }, h("h2", { text: "Nhật ký quản trị" }), enabled.root, channel.root, bans.root, timeouts.root, roles.root, automod.root, button);
}
