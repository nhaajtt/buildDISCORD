import { h, icon } from "../dom.js";
import { busy, checkList, lockBadge, notice, numberField, pickerField, switchField, textField } from "../forms.js";

const LEVELS = [
  { id: "nhe", name: "Nhẹ", pro: false, blocks: ["Chống spam", "Chặn link mời server khác"] },
  { id: "vua", name: "Vừa", pro: true, blocks: ["Mọi thứ của mức Nhẹ", "Chống tag bừa, kèm cho nghỉ chat 60 giây", "Chặn chửi thề và lời lẽ xúc phạm"] },
  { id: "gat", name: "Gắt", pro: true, blocks: ["Mọi thứ của mức Vừa", "Chặn nội dung 18+", "Chặn mọi link nếu bật công tắc bên dưới"] },
];

// The server's own blocked words. Discord does the blocking, so the bot never reads a message.
function wordsCard({ detail, save }) {
  const limit = detail.plan.limits.customWords;
  const words = [...detail.settings.automod.customWords];
  const input = textField("Thêm từ khoá", "", { max: 60, hint: "Không phân biệt hoa thường. Mỗi từ tối đa 60 ký tự." });
  const count = h("p", { class: "hint" });
  const list = h("ul", { class: "chips plain" });
  const add = h("button", { class: "btn btn-ghost btn-sm", type: "button" }, icon("plus", 16), " Thêm từ");
  const draw = () => {
    list.replaceChildren(
      ...words.map((w, i) => {
        const remove = h("button", { class: "icon-btn", type: "button", "aria-label": `Bỏ từ ${w}` }, icon("trash", 14));
        remove.addEventListener("click", () => {
          words.splice(i, 1);
          draw();
        });
        return h("li", { class: "chip chip-on" }, h("span", { text: w }), remove);
      }),
    );
    count.textContent = `${words.length} / ${limit === null ? "không giới hạn" : limit} từ${limit !== null && words.length > limit ? " (vượt gói, chỉ bớt được, không thêm được)" : ""}`;
    add.disabled = limit !== null && words.length >= limit;
  };
  const addWord = () => {
    const w = input.get().trim().toLowerCase();
    if (w && !words.includes(w) && (limit === null || words.length < limit)) words.push(w);
    input.input.value = "";
    draw();
  };
  add.addEventListener("click", addWord);
  input.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWord();
    }
  });
  draw();
  const button = h("button", { class: "btn", type: "button", text: "Lưu từ khoá" });
  button.addEventListener("click", () => busy(button, () => save("automod", { customWords: words })));
  return h("div", { class: "card stack" }, h("h3", { text: "Từ khoá tự chế" }), count, list, input.root, add, button);
}

export function automodTab({ detail, save }) {
  const s = detail.settings.automod;
  const full = detail.plan.limits.automodFull;
  let level = full ? s.level : "nhe";

  const enabled = switchField("Bật AutoMod", s.enabled, { hint: "Thầu dựng luật AutoMod của Discord, Discord tự chặn, thầu không đọc tin nhắn của ai." });

  const cards = h("div", { class: "levels", role: "radiogroup", "aria-label": "Mức độ AutoMod" });
  const draw = () => {
    cards.replaceChildren(
      ...LEVELS.map((l) => {
        const locked = l.pro && !full;
        const card = h(
          "button",
          { class: `level ${level === l.id ? "level-on" : ""}`, type: "button", role: "radio", "aria-checked": level === l.id ? "true" : "false", disabled: locked },
          h("span", { class: "level-name" }, l.name, locked ? lockBadge() : null),
          h("ul", { class: "plain" }, l.blocks.map((b) => h("li", { text: b }))),
        );
        card.addEventListener("click", () => {
          level = l.id;
          draw();
        });
        return card;
      }),
    );
  };
  draw();

  const invites = switchField("Chặn link mời server khác", s.blockInvites);
  const links = switchField("Chặn mọi link", full && s.blockLinks, { disabled: !full, hint: full ? "Chỉ chạy ở mức Gắt." : "Gói Pro trở lên." });
  const mention = numberField("Giới hạn số lần tag trong một tin", s.mentionLimit, { min: 3, max: 20, hint: "Dùng ở mức Vừa và Gắt." });
  const log = pickerField("Kênh nhận cảnh báo", detail.texts, s.logChannelId, { none: "Không gửi cảnh báo", prefix: "#" });
  const exempt = checkList("Role được miễn AutoMod", detail.roles.map((r) => ({ id: r.id, name: r.name })), full ? s.exemptRoleIds : [], { disabled: !full, hint: full ? "Tối đa 20 role." : "Gói Pro trở lên." });

  const button = h("button", { class: "btn", type: "button", text: "Lưu và áp dụng AutoMod" });
  button.addEventListener("click", () =>
    busy(button, () =>
      save("automod", {
        enabled: enabled.get(),
        level,
        blockInvites: invites.get(),
        blockLinks: full ? links.get() : false,
        mentionLimit: mention.get(),
        logChannelId: log.get(),
        exemptRoleIds: full ? exempt.get() : [],
      }),
    ),
  );
  return h(
    "form",
    { class: "stack", onsubmit: (e) => e.preventDefault() },
    h("h2", { text: "AutoMod" }),
    full ? null : notice("Gói miễn phí chỉ có mức Nhẹ kèm chặn link mời. Mức Vừa, Gắt, chặn link và miễn trừ role là của gói Pro trở lên.", "warn"),
    enabled.root,
    cards,
    invites.root,
    links.root,
    mention.root,
    log.root,
    exempt.root,
    button,
    wordsCard({ detail, save }),
  );
}
