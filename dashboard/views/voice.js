import { h, icon } from "../dom.js";
import { busy, notice, numberField, pickerField, switchField, textField } from "../forms.js";

const KINDS = [
  { id: "members", name: "Số thành viên" },
  { id: "boosts", name: "Số lượt boost" },
  { id: "channels", name: "Số kênh" },
  { id: "roles", name: "Số role" },
];

const limitText = (n) => (n === null ? "không giới hạn" : String(n));

function tempCard({ detail, save }) {
  const s = detail.settings.tempvoice;
  const max = detail.plan.limits.tempLobbies;
  const lobbies = [...s.lobbyChannelIds];

  const enabled = switchField("Bật phòng tạm", s.enabled, { hint: "Ai vào phòng chờ sẽ được thầu tạo một phòng riêng và chuyển qua. Phòng trống thì thầu xoá. Thầu chỉ xoá phòng do chính mình tạo." });
  const category = pickerField("Danh mục chứa phòng tạm", detail.categories, s.categoryId, { none: "Cùng danh mục với phòng chờ" });
  const template = textField("Mẫu tên phòng", s.nameTemplate, { max: 60, hint: "{name} là tên người tạo phòng." });
  const limit = numberField("Giới hạn người trong phòng (0 là không giới hạn)", s.userLimit, { min: 0, max: 99 });

  const list = h("ul", { class: "rows plain" });
  const picker = pickerField("Thêm phòng chờ", detail.voices, null, { none: "Chọn phòng thoại", prefix: "🔊 " });
  const add = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("plus", 16), " Thêm");
  const draw = () => {
    list.replaceChildren(
      ...lobbies.map((id, i) => {
        const name = detail.voices.find((v) => v.id === id)?.name;
        const remove = h("button", { class: "icon-btn", type: "button", "aria-label": `Bỏ phòng chờ ${name ?? id}` }, icon("trash", 18));
        remove.addEventListener("click", () => {
          lobbies.splice(i, 1);
          draw();
        });
        return h("li", { class: "row" }, h("span", { text: name ? `🔊 ${name}` : "Phòng không còn trong server" }), remove);
      }),
    );
    add.disabled = max !== null && lobbies.length >= max;
  };
  add.addEventListener("click", () => {
    const id = picker.get();
    if (id && !lobbies.includes(id)) lobbies.push(id);
    picker.select.value = "";
    draw();
  });
  draw();

  const button = h("button", { class: "btn", type: "button", text: "Lưu phòng tạm" });
  button.addEventListener("click", () => busy(button, () => save("tempvoice", { enabled: enabled.get(), lobbyChannelIds: lobbies, categoryId: category.get(), nameTemplate: template.get(), userLimit: limit.get() })));
  return h(
    "form",
    { class: "stack card", onsubmit: (e) => e.preventDefault() },
    h("h3", { text: "Phòng thoại tạm" }),
    notice(`Gói của bạn cho ${limitText(max)} phòng chờ. Đang có ${detail.overview.counts.tempRooms} phòng tạm.`),
    enabled.root,
    h("p", { class: "hint", text: `Phòng chờ (${lobbies.length} / ${limitText(max)})` }),
    list,
    picker.root,
    add,
    category.root,
    template.root,
    limit.root,
    button,
  );
}

function statsCard({ detail, save }) {
  const s = detail.settings.stats;
  const max = detail.plan.limits.statsChannels;
  const rows = s.channels.map((c) => ({ ...c }));

  const enabled = switchField("Bật kênh thống kê", s.enabled, { hint: "Thầu đổi tên kênh thoại thành con số sống, ví dụ Thành viên: 128. Chọn kênh riêng cho việc này, thầu sẽ đổi tên nó." });
  const list = h("div", { class: "stack" });
  const add = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("plus", 16), " Thêm kênh thống kê");
  const draw = () => {
    list.replaceChildren(
      ...rows.map((r, i) => {
        const channel = pickerField(`Kênh thống kê ${i + 1}`, detail.voices, r.channelId, { none: "Chọn phòng thoại", prefix: "🔊 " });
        const kind = pickerField("Số liệu", KINDS, r.kind, { none: "Số thành viên" });
        const template = textField("Mẫu tên", r.template, { max: 60, hint: "Phải có {n} để thầu điền con số." });
        channel.select.addEventListener("change", () => (r.channelId = channel.get()));
        kind.select.addEventListener("change", () => (r.kind = kind.get() ?? "members"));
        template.input.addEventListener("input", () => (r.template = template.get()));
        const remove = h("button", { class: "icon-btn", type: "button", "aria-label": `Bỏ kênh thống kê ${i + 1}` }, icon("trash", 18));
        remove.addEventListener("click", () => {
          rows.splice(i, 1);
          draw();
        });
        return h("div", { class: "card stack" }, channel.root, kind.root, template.root, remove);
      }),
    );
    add.disabled = max !== null && rows.length >= max;
  };
  add.addEventListener("click", () => {
    rows.push({ channelId: null, kind: "members", template: "Thành viên: {n}" });
    draw();
  });
  draw();

  const button = h("button", { class: "btn", type: "button", text: "Lưu kênh thống kê" });
  button.addEventListener("click", () => busy(button, () => save("stats", { enabled: enabled.get(), channels: rows.filter((r) => r.channelId) })));
  return h("form", { class: "stack card", onsubmit: (e) => e.preventDefault() }, h("h3", { text: "Kênh thống kê" }), notice(`Gói của bạn cho ${limitText(max)} kênh thống kê. Đang dùng ${rows.length}.`), enabled.root, list, add, button);
}

export function voiceTab(ctx) {
  return h("div", { class: "stack" }, h("h2", { text: "Phòng thoại" }), tempCard(ctx), statsCard(ctx));
}
