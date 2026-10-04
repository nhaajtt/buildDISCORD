import { h, fmtDate } from "../dom.js";
import { busy, lockBadge, notice, numberField, pickerField, switchField } from "../forms.js";

const YOUNG = [
  { id: "alert", name: "Chỉ báo động" },
  { id: "kick", name: "Đuổi khỏi server" },
];

const ACTIONS = [
  { id: "alert", name: "Chỉ báo động" },
  { id: "verify", name: "Nâng mức xác minh của server" },
  { id: "lock", name: "Khoá kênh một lúc" },
];

export function securityTab({ detail, save, unlock }) {
  const s = detail.settings.security;
  const nukeOk = detail.plan.limits.nukeGuard;

  const raid = switchField("Chống raid (nhiều người vào cùng lúc)", s.raidEnabled, { hint: "Thầu đếm số người mới vào trong một khoảng ngắn, vượt ngưỡng thì ra tay." });
  const joins = numberField("Số người vào để tính là raid", s.raidJoins, { min: 3, max: 50 });
  const windowSec = numberField("Trong bao nhiêu giây", s.raidWindowSec, { min: 10, max: 300 });
  const action = pickerField("Khi có raid thì", ACTIONS, s.raidAction, { none: "Nâng mức xác minh của server" });
  const lockMinutes = numberField("Khoá bao nhiêu phút (nếu chọn khoá kênh)", s.lockMinutes, { min: 1, max: 120 });
  const alertChannel = pickerField("Kênh nhận cảnh báo", detail.texts, s.alertChannelId, { none: "Không gửi cảnh báo", prefix: "#" });

  const nuke = switchField("Chống xoá hàng loạt (nuke)", nukeOk && s.nukeEnabled, { disabled: !nukeOk, hint: nukeOk ? "Ai xoá nhiều kênh hay role trong thời gian ngắn sẽ bị thầu báo động." : "Gói Pro trở lên." });
  const threshold = numberField("Số lần xoá để tính là nuke", s.nukeThreshold, { min: 2, max: 10 });
  const nukeWindow = numberField("Trong bao nhiêu giây", s.nukeWindowSec, { min: 10, max: 600 });

  const minAge = numberField("Tuổi tối thiểu của tài khoản (ngày, 0 là tắt)", s.minAccountAgeDays, { min: 0, max: 365, hint: "Tài khoản Discord mới tạo hơn mức này khi vào server sẽ bị xử lý theo lựa chọn bên dưới." });
  const young = pickerField("Với tài khoản quá mới thì", YOUNG, s.youngAction, { none: "Chỉ báo động", hint: "Đuổi khỏi server chỉ có tác dụng khi thầu có quyền Đuổi thành viên. Người bị đuổi vẫn vào lại được khi tài khoản đủ tuổi." });

  const button = h("button", { class: "btn", type: "button", text: "Lưu cài đặt bảo vệ" });
  button.addEventListener("click", () =>
    busy(button, () =>
      save("security", {
        raidEnabled: raid.get(),
        raidJoins: joins.get(),
        raidWindowSec: windowSec.get(),
        raidAction: action.get() ?? "verify",
        lockMinutes: lockMinutes.get(),
        alertChannelId: alertChannel.get(),
        nukeEnabled: nukeOk ? nuke.get() : false,
        nukeThreshold: threshold.get(),
        nukeWindowSec: nukeWindow.get(),
        minAccountAgeDays: minAge.get(),
        youngAction: young.get() ?? "alert",
      }),
    ),
  );

  const lock = s.lockdown;
  const lockBox = lock.active
    ? h(
        "article",
        { class: "card" },
        h("h3", { text: "Server đang bị khoá" }),
        h("p", { text: `Khoá từ ${fmtDate(lock.since)}, ${lock.channels.length} kênh bị chặn gửi tin.` }),
        h("p", { class: "hint", text: "Mở khoá sẽ trả mức xác minh và quyền gửi tin của các kênh về đúng như trước lúc khoá, không đụng thứ gì khác." }),
      )
    : h("article", { class: "card" }, h("h3", { text: "Chế độ khoá" }), h("p", { text: "Server đang bình thường, không có khoá nào." }));
  if (lock.active) {
    const unlockButton = h("button", { class: "btn btn-sm", type: "button", text: "Mở khoá server" });
    unlockButton.addEventListener("click", () => busy(unlockButton, () => unlock()));
    lockBox.append(unlockButton);
  }

  return h(
    "div",
    { class: "stack" },
    h("h2", { text: "Bảo vệ" }),
    lockBox,
    h(
      "form",
      { class: "stack", onsubmit: (e) => e.preventDefault() },
      nukeOk ? null : notice("Chống raid có ở mọi gói. Chống xoá hàng loạt là của gói Pro trở lên.", "warn"),
      raid.root,
      joins.root,
      windowSec.root,
      action.root,
      lockMinutes.root,
      alertChannel.root,
      h("h3", { text: "Tài khoản mới tạo" }),
      minAge.root,
      young.root,
      h("h3", {}, "Chống xoá hàng loạt ", nukeOk ? null : lockBadge()),
      nuke.root,
      threshold.root,
      nukeWindow.root,
      button,
    ),
  );
}
