import { h } from "../dom.js";
import { busy, lockBadge, notice, numberField, pickerField, switchField } from "../forms.js";

export function activityTab({ detail, save }) {
  const s = detail.settings.activity;
  const ok = detail.plan.limits.activity;

  const enabled = switchField("Bật điểm hoạt động", ok && s.enabled, { disabled: !ok, hint: ok ? "Thầu cộng điểm khi thành viên chat và ngồi phòng thoại. Thầu chỉ đếm, không đọc nội dung tin nhắn." : "Gói Pro trở lên." });
  const perMessage = numberField("Điểm cho mỗi tin nhắn", s.xpPerMessage, { min: 1, max: 50 });
  const cooldown = numberField("Cách nhau tối thiểu (giây) giữa hai lần cộng điểm", s.cooldownSec, { min: 10, max: 600, hint: "Spam liên tục không được thêm điểm." });
  const cap = numberField("Điểm tối đa mỗi người mỗi ngày", s.dailyCap, { min: 50, max: 5000 });
  const voice = switchField("Tính điểm theo thời gian ở phòng thoại", s.voiceEnabled);
  const perMinute = numberField("Điểm mỗi phút ở phòng thoại", s.voiceXpPerMin, { min: 0, max: 20 });
  const announce = pickerField("Kênh báo khi lên cấp", detail.texts, s.announceChannelId, { none: "Không báo", prefix: "#" });

  const button = h("button", { class: "btn", type: "button", text: "Lưu điểm hoạt động" });
  button.addEventListener("click", () =>
    busy(button, () =>
      save("activity", {
        enabled: ok ? enabled.get() : false,
        xpPerMessage: perMessage.get(),
        cooldownSec: cooldown.get(),
        dailyCap: cap.get(),
        voiceEnabled: voice.get(),
        voiceXpPerMin: perMinute.get(),
        announceChannelId: announce.get(),
      }),
    ),
  );
  return h(
    "form",
    { class: "stack", onsubmit: (e) => e.preventDefault() },
    h("h2", {}, "Điểm hoạt động ", ok ? null : lockBadge()),
    ok ? null : notice("Điểm hoạt động và cấp độ là của gói Pro trở lên. Gói hết hạn thì chỉ còn tắt được.", "warn"),
    enabled.root,
    perMessage.root,
    cooldown.root,
    cap.root,
    voice.root,
    perMinute.root,
    announce.root,
    button,
  );
}
