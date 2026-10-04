import { h, fmtDate } from "../dom.js";
import { busy, confirmDialog, lockBadge, notice, numberField, pickerField, textField } from "../forms.js";

const STATUS = { active: "Đang chạy", ended: "Đã kết thúc", cancelled: "Đã huỷ" };

function giveawayCard(g, { act, allowed }) {
  const when = g.status === "active" ? `Kết thúc ${fmtDate(g.endsAt)}` : `Hạn chót ${fmtDate(g.endsAt)}`;
  const actions = h("div", { class: "row" });
  if (g.status === "active") {
    const end = h("button", { class: "btn btn-sm", type: "button", text: "Kết thúc ngay" });
    end.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: `Kết thúc giveaway #${g.id}?`, lines: ["Thầu bốc thăm người trúng ngay bây giờ.", "Kết quả được báo ở kênh giveaway.", "Không quay lại được."], confirmLabel: "Kết thúc" });
      if (ok) await busy(end, () => act("POST", `/giveaways/${g.id}/end`, {}, "giveaways"));
    });
    const cancel = h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Huỷ" });
    cancel.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: `Huỷ giveaway #${g.id}?`, lines: ["Không ai trúng, danh sách tham gia bị bỏ.", "Tin trên kênh được đổi thành đã huỷ."], confirmLabel: "Huỷ giveaway" });
      if (ok) await busy(cancel, () => act("POST", `/giveaways/${g.id}/cancel`, {}, "giveaways"));
    });
    actions.append(end, cancel);
  }
  if (g.status === "ended") {
    const count = numberField("Chọn thêm mấy người", 1, { min: 1, max: 10 });
    const reroll = h("button", { class: "btn btn-sm", type: "button", text: "Chọn lại", disabled: !allowed });
    reroll.addEventListener("click", () => busy(reroll, () => act("POST", `/giveaways/${g.id}/reroll`, { count: count.get() }, "giveaways")));
    actions.append(count.root, reroll);
  }
  return h(
    "article",
    { class: "card" },
    h("h3", {}, `#${g.id} `, h("span", { text: g.prize })),
    h("p", { class: "hint", text: `${STATUS[g.status] ?? g.status}. ${when}. ${g.entries} người tham gia, ${g.winners} giải.` }),
    h("p", { class: "hint", text: `Kênh ${g.channelName ? `#${g.channelName}` : g.channelId}${g.roleId ? `, cần role ${g.roleName ?? g.roleId}` : ""}.` }),
    g.status === "ended" ? h("p", { text: g.winnerIds.length ? `${g.winnerIds.length} người trúng (mã cuối: ${g.winnerIds.map((id) => `...${id.slice(-4)}`).join(", ")})` : "Không ai trúng." }) : null,
    actions,
  );
}

export function giveawaysTab({ detail, act }) {
  const g = detail.giveaways;
  const allowed = detail.plan.limits.giveaways;

  const prize = textField("Phần thưởng", "", { max: 100 });
  const winners = numberField("Số người trúng (1 đến 10)", 1, { min: 1, max: 10 });
  const time = pickerField("Chạy trong", g.durations.map((d) => ({ id: String(d.value), name: d.name })), "60", { none: "Chọn thời gian" });
  const channel = pickerField("Kênh đăng giveaway", detail.texts, null, { none: "Chọn kênh", prefix: "#", hint: "Thầu cần quyền xem kênh, gửi tin và nhúng link ở đó." });
  const role = pickerField("Chỉ người có role này được tham gia", detail.roles, null, { none: "Ai cũng tham gia được", hint: "Kiểm tra lúc bấm nút Tham gia." });

  const button = h("button", { class: "btn", type: "button", text: "Mở giveaway", disabled: !allowed || g.open >= g.max });
  button.addEventListener("click", () =>
    busy(button, () => act("POST", "/giveaways", { prize: prize.get(), winners: winners.get(), minutes: Number(time.get()), channelId: channel.get(), roleId: role.get() }, "giveaways")),
  );

  return h(
    "div",
    { class: "stack" },
    h("h2", {}, "Giveaway ", allowed ? null : lockBadge()),
    allowed ? null : notice("Giveaway là của gói Pro trở lên. Bạn vẫn huỷ hoặc kết thúc được giveaway đang chạy.", "warn"),
    g.open >= g.max ? notice(`Đang có ${g.open} giveaway chạy, tối đa ${g.max}. Kết thúc hoặc huỷ bớt một cái.`, "warn") : null,
    h("form", { class: "stack", onsubmit: (e) => e.preventDefault() }, h("h3", { text: "Mở giveaway mới" }), prize.root, winners.root, time.root, channel.root, role.root, button),
    h("h3", { text: `Gần đây (${g.list.length})` }),
    g.list.length ? h("div", { class: "cards" }, g.list.map((x) => giveawayCard(x, { act, allowed }))) : h("p", { text: "Chưa có giveaway nào. Mở một cái cho server rôm rả." }),
  );
}
