import { h, icon, uid } from "../dom.js";
import { busy, confirmDialog, lockBadge, notice, pickerField, textField } from "../forms.js";

const MAX_ROLES = 10;
const MODES = [
  { id: "multi", name: "Chọn nhiều role" },
  { id: "single", name: "Chọn một (đổi role thì role cũ rút)" },
];

// Which menu is open for editing survives a redraw, so saving does not close the form under the person's hands
let editing = null;

function menuForm(menu, { detail, act }) {
  const roleOptions = detail.roles.map((r) => ({ id: r.id, name: r.name, note: r.unsafe ? "không dùng được" : "", disabled: r.unsafe }));
  const rows = menu ? menu.roles.map((r) => ({ id: r.id, emoji: r.emoji })) : [{ id: null, emoji: "" }];

  const title = textField("Tiêu đề menu", menu?.title ?? "", { max: 100 });
  const mode = pickerField("Chế độ", MODES, menu?.mode ?? "multi", { none: "Chọn nhiều role" });
  const channel = menu ? null : pickerField("Đăng luôn ở kênh", detail.texts, null, { none: "Chưa đăng, để sau", prefix: "#" });
  const list = h("div", { class: "stack" });
  const add = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("plus", 16), " Thêm role");
  const draw = () => {
    list.replaceChildren(
      ...rows.map((r, i) => {
        const role = pickerField(`Role ${i + 1}`, roleOptions, r.id, { none: "Chọn role", hint: i === 0 ? "Role có quyền quản trị hoặc cao hơn role của thầu bị khoá." : "" });
        const emojiId = uid("em");
        const emoji = h("input", { id: emojiId, type: "text", maxlength: 8, class: "emoji", value: r.emoji ?? "", autocomplete: "off" });
        role.select.addEventListener("change", () => (r.id = role.get()));
        emoji.addEventListener("input", () => (r.emoji = emoji.value));
        const remove = h("button", { class: "icon-btn", type: "button", "aria-label": `Bỏ role ${i + 1}`, disabled: rows.length === 1 }, icon("trash", 18));
        remove.addEventListener("click", () => {
          rows.splice(i, 1);
          draw();
        });
        return h("div", { class: "type-row" }, role.root, h("div", { class: "field" }, h("label", { for: emojiId, text: "Emoji" }), emoji), remove);
      }),
    );
    add.disabled = rows.length >= MAX_ROLES;
  };
  add.addEventListener("click", () => {
    rows.push({ id: null, emoji: "" });
    draw();
  });
  draw();

  const body = () => ({ title: title.get(), mode: mode.get() ?? "multi", roles: rows.filter((r) => r.id).map((r) => ({ id: r.id, emoji: r.emoji ?? "" })) });
  const save = h("button", { class: "btn", type: "button", text: menu ? "Lưu menu" : "Tạo menu" });
  save.addEventListener("click", () =>
    busy(save, async () => {
      const result = menu ? await act("PUT", `/rolemenus/${menu.id}`, body(), "menus") : await act("POST", "/rolemenus", { ...body(), channelId: channel.get() }, "menus");
      if (result && editing !== null) {
        editing = null;
        act.redraw();
      }
    }),
  );
  const cancel = menu ? h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Đóng", onclick: () => ((editing = null), act.redraw()) }) : null;
  return h("form", { class: "stack card", onsubmit: (e) => e.preventDefault() }, h("h3", { text: menu ? `Sửa menu #${menu.id}` : "Tạo menu mới" }), title.root, mode.root, list, add, channel?.root, h("div", { class: "row" }, save, cancel));
}

function menuCard(menu, ctx) {
  const { detail, act } = ctx;
  const post = pickerField("Kênh đăng bảng", detail.texts, menu.channelId, { none: "Chọn kênh", prefix: "#" });
  const postButton = h("button", { class: "btn btn-sm", type: "button", text: menu.posted ? "Làm mới hoặc đăng lại" : "Đăng bảng" });
  postButton.addEventListener("click", () => busy(postButton, () => act("POST", `/rolemenus/${menu.id}/post`, { channelId: post.get() }, "menus")));
  const edit = h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Sửa" });
  edit.addEventListener("click", () => {
    editing = menu.id;
    act.redraw();
  });
  const remove = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("trash", 16), " Xoá");
  remove.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: `Xoá menu #${menu.id}?`, lines: ["Nút cũ trên bảng thôi hoạt động.", "Role người ta đã nhận thì giữ nguyên."], confirmLabel: "Xoá menu" });
    if (ok) await busy(remove, () => act("DELETE", `/rolemenus/${menu.id}`, undefined, "menus"));
  });
  return h(
    "article",
    { class: "card stack" },
    h("h3", {}, `#${menu.id} `, h("span", { text: menu.title })),
    h("p", { class: "hint", text: `${menu.mode === "single" ? "Chọn một" : "Chọn nhiều"}, ${menu.roles.length} role, ${menu.posted ? `đã đăng ở ${menu.channelName ? `#${menu.channelName}` : "kênh cũ"}` : "chưa đăng"}.` }),
    h(
      "ul",
      { class: "chips plain" },
      menu.roles.map((r) => h("li", { class: `chip ${r.unsafe ? "" : "chip-on"}` }, `${r.emoji ? `${r.emoji} ` : ""}${r.name ?? "Role đã xoá"}${r.unsafe ? " (không dùng được)" : ""}`)),
    ),
    post.root,
    h("div", { class: "row" }, postButton, edit, remove),
    editing === menu.id ? menuForm(menu, ctx) : null,
  );
}

export function menusTab(ctx) {
  const { detail } = ctx;
  const m = detail.roleMenus;
  const limit = detail.plan.limits.roleMenus;
  const full = limit !== null && m.count >= limit;
  const actWithRedraw = Object.assign((...args) => ctx.act(...args), { redraw: ctx.redraw });
  const sub = { ...ctx, act: actWithRedraw };
  const noun = limit === null ? `${m.count} menu` : `${m.count} / ${limit} menu`;
  return h(
    "div",
    { class: "stack" },
    h("h2", {}, "Menu role ", limit === 0 ? lockBadge() : null),
    notice(`Gói của bạn dùng được ${noun}. Thầu cần quyền Quản lý role và role của thầu phải nằm trên các role trong menu.`),
    full ? notice("Đã hết số menu của gói. Xoá bớt một cái hoặc nâng cấp.", "warn") : menuForm(null, sub),
    m.list.length ? h("div", { class: "stack" }, m.list.map((x) => menuCard(x, sub))) : h("p", { text: "Chưa có menu nào. Tạo một cái để thành viên tự xin role." }),
  );
}
