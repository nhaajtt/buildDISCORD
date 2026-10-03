import { h, icon, uid } from "../dom.js";
import { busy, lockBadge, notice, numberField, pickerField, switchField } from "../forms.js";

const MAX_TYPES = 5;

export function ticketsTab({ detail, save, post, reload }) {
  const s = detail.settings.tickets;
  const allowed = detail.plan.limits.tickets;
  const off = !allowed;
  // Rows keep the key of types that already exist, so the buttons on a posted panel keep working
  let types = s.types.map((t) => ({ ...t }));

  const enabled = switchField("Bật hệ thống ticket", s.enabled, { disabled: off });
  const panel = pickerField("Kênh đăng bảng ticket", detail.texts, s.panelChannelId, { prefix: "#", disabled: off });
  const staff = pickerField("Role staff", detail.roles, s.staffRoleId, { hint: "Role này chỉ được xem và gửi tin trong kênh ticket.", disabled: off });
  const category = pickerField("Danh mục chứa kênh ticket", detail.categories, s.categoryId, { none: "Không dùng danh mục", disabled: off });
  const log = pickerField("Kênh nhật ký", detail.texts, s.logChannelId, { none: "Không ghi nhật ký", prefix: "#", hint: "Chỉ ghi mở, nhận, đóng, không có nội dung.", disabled: off });
  const hours = numberField("Tự đóng sau (giờ im lặng, 0 là tắt)", s.autoCloseHours, { min: 0, max: 720 });
  const most = numberField("Số ticket mở cùng lúc của mỗi người", s.maxOpenPerUser, { min: 1, max: 5 });
  hours.input.disabled = off;
  most.input.disabled = off;

  const list = h("div", { class: "types" });
  const draw = () => {
    list.replaceChildren(
      ...types.map((t, i) => {
        const labelId = uid("tl");
        const emojiId = uid("te");
        const label = h("input", { id: labelId, type: "text", maxlength: 40, value: t.label, disabled: off });
        const emoji = h("input", { id: emojiId, type: "text", maxlength: 8, value: t.emoji, class: "emoji", disabled: off });
        label.addEventListener("input", () => (t.label = label.value));
        emoji.addEventListener("input", () => (t.emoji = emoji.value));
        const remove = h("button", { class: "icon-btn", type: "button", "aria-label": `Xoá loại ${t.label || i + 1}`, disabled: off || types.length === 1 }, icon("trash", 18));
        remove.addEventListener("click", () => {
          types.splice(i, 1);
          draw();
        });
        return h("div", { class: "type-row" }, h("div", { class: "field" }, h("label", { for: labelId, text: `Tên loại ${i + 1}` }), label), h("div", { class: "field" }, h("label", { for: emojiId, text: "Emoji" }), emoji), remove);
      }),
    );
    add.disabled = off || types.length >= MAX_TYPES;
  };
  const add = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("plus", 16), " Thêm loại");
  add.addEventListener("click", () => {
    types.push({ label: "", emoji: "" });
    draw();
  });
  draw();

  const body = () => ({
    enabled: enabled.get(),
    panelChannelId: panel.get(),
    staffRoleId: staff.get(),
    categoryId: category.get(),
    logChannelId: log.get(),
    autoCloseHours: hours.get(),
    maxOpenPerUser: most.get(),
    types: types.map((t) => ({ key: t.key, label: t.label, emoji: t.emoji })),
  });

  const saveBtn = h("button", { class: "btn", type: "button", text: "Lưu cài đặt ticket", disabled: off });
  saveBtn.addEventListener("click", () => busy(saveBtn, () => save("tickets", body())));
  const postBtn = h("button", { class: "btn btn-ghost", type: "button", text: "Đăng bảng điều khiển", disabled: off });
  postBtn.addEventListener("click", () =>
    busy(postBtn, async () => {
      // The panel is posted from what is saved, so save first
      const saved = await save("tickets", body());
      if (saved) await post();
    }),
  );
  const turnOff = h("button", { class: "btn btn-ghost", type: "button", text: "Tắt ticket" });
  turnOff.addEventListener("click", () => busy(turnOff, () => save("tickets", { enabled: false }).then(reload)));

  return h(
    "form",
    { class: "stack", onsubmit: (e) => e.preventDefault() },
    h("h2", {}, "Ticket ", off ? lockBadge() : null),
    off ? notice("Hệ thống ticket là của gói Pro trở lên. Gõ /goi trong server để xem cách nâng cấp.", "warn") : null,
    off && s.enabled ? turnOff : null,
    enabled.root,
    panel.root,
    staff.root,
    category.root,
    log.root,
    h("fieldset", { class: "field" }, h("legend", { text: `Các loại ticket (tối đa ${MAX_TYPES})` }), list, add),
    hours.root,
    most.root,
    h("div", { class: "row" }, saveBtn, postBtn),
  );
}
