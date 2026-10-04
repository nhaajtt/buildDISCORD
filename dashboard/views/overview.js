import { h, fmtDate } from "../dom.js";
import { scoreRing } from "./health.js";

const used = (n, cap) => (cap === null ? `${n} (không giới hạn)` : `${n} / ${cap}`);

export function overviewTab({ detail }) {
  const { plan, usage, audit, tickets, settings, overview } = detail;
  const chip = (text, on) => h("li", { class: `chip ${on ? "chip-on" : ""}` }, `${text}: ${on ? "bật" : "tắt"}`);
  const latest = audit.latest;
  return h(
    "div",
    { class: "stack" },
    h("h2", { text: "Tổng quan" }),
    h(
      "div",
      { class: "cards" },
      h(
        "article",
        { class: "card" },
        h("h3", { text: "Gói hiện tại" }),
        h("p", { class: "big", text: plan.label }),
        h("p", { class: "hint", text: plan.expiresAt ? `Hết hạn ${fmtDate(plan.expiresAt)}` : plan.plan === "free" ? "Không hết hạn, nhưng cũng không có gì hot." : "" }),
      ),
      h(
        "article",
        { class: "card" },
        h("h3", { text: "Mức dùng" }),
        h("p", {}, "Lần xây server: ", h("strong", { text: used(usage.builds, plan.limits.buildsTotal) })),
        h("p", {}, "Lượt thiết kế AI tháng này: ", h("strong", { text: used(usage.ai, plan.limits.aiPerMonth) })),
      ),
      h(
        "article",
        { class: "card center" },
        h("h3", { text: "Sức khoẻ server" }),
        latest ? [scoreRing(latest.score), h("p", { class: "hint", text: `${latest.grade}, khám lúc ${fmtDate(latest.createdAt)}` })] : h("p", { text: "Chưa khám lần nào. Qua tab Khám sức khoẻ bấm một cái là có." }),
      ),
    ),
    h("article", { class: "card" }, h("h3", { text: "Tính năng" }), h("ul", { class: "chips plain" }, chip("Chào mừng", settings.welcome.enabled), chip("AutoMod", settings.automod.enabled), chip("Ticket", settings.tickets.enabled), chip("Chống raid", settings.security.raidEnabled), chip("Chống nuke", settings.security.nukeEnabled), chip("Điểm hoạt động", settings.activity.enabled), chip("Báo cáo tuần", settings.digest.enabled), chip("Nhật ký quản trị", settings.modlog.enabled), chip("Phòng tạm", settings.tempvoice.enabled), chip("Kênh thống kê", settings.stats.enabled), chip("Góp ý", settings.suggest.enabled))),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Đang chạy" }),
      h(
        "ul",
        { class: "rows plain" },
        h("li", {}, "Giveaway đang mở: ", h("strong", { text: String(overview.counts.giveawaysOpen) })),
        h("li", {}, "Menu role: ", h("strong", { text: String(overview.counts.roleMenus) })),
        h("li", {}, "Phòng chờ tạo phòng: ", h("strong", { text: String(overview.counts.tempLobbies) }), `, đang có ${overview.counts.tempRooms} phòng tạm`),
        h("li", {}, "Tin nhắn hẹn giờ: ", h("strong", { text: String(overview.counts.scheduledMessages) })),
        h("li", {}, "Góp ý đang chờ: ", h("strong", { text: String(overview.counts.suggestionsOpen) })),
      ),
    ),
    h(
      "article",
      { class: "card" },
      h("h3", { text: `Ticket đang mở (${tickets.count})` }),
      tickets.count
        ? h(
            "ul",
            { class: "rows plain" },
            tickets.list.map((t) => h("li", {}, h("strong", { text: `#${t.id}` }), ` ${t.type}, kênh ${t.channelName ? `#${t.channelName}` : t.channelId}, ${fmtDate(t.createdAt)}${t.claimed ? ", đã có người nhận" : ""}`)),
          )
        : h("p", { text: "Chưa có ticket nào đang mở. Hiếm có khó tìm, tận hưởng đi." }),
    ),
  );
}
