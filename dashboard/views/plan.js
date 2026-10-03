import { h, icon, fmtDate, fmtMoney } from "../dom.js";

const FEATURES = [
  ["mix", "Trộn nhiều theme khi xây"],
  ["humor", "Chọn mức hài"],
  ["automodFull", "AutoMod mức Vừa, Gắt, chặn link, miễn trừ"],
  ["tickets", "Hệ thống ticket"],
  ["games", "Mini-game và bảng xếp hạng"],
  ["events", "Sự kiện định kỳ"],
];
const COUNTS = [
  ["buildsTotal", "Số lần xây server"],
  ["aiPerMonth", "Lượt thiết kế AI mỗi tháng"],
  ["backups", "Bản sao lưu"],
  ["customThemes", "Theme tự tạo"],
  ["recurringEvents", "Sự kiện định kỳ tối đa"],
];
const STATUS = { PENDING: "Đang chờ", PAID: "Đã thanh toán", CANCELLED: "Đã huỷ", EXPIRED: "Hết hạn" };

export function planTab({ detail }) {
  const { plan, orders, buy } = detail;
  const yes = (on) => h("span", { class: on ? "yes" : "no" }, icon(on ? "check" : "lock", 16), h("span", { class: "sr-only", text: on ? "Có" : "Không" }));
  const count = (v) => (v === null ? "Không giới hạn" : String(v));
  return h(
    "div",
    { class: "stack" },
    h("h2", { text: "Gói và thanh toán" }),
    h("article", { class: "card" }, h("p", { class: "big", text: plan.label }), h("p", { class: "hint", text: plan.expiresAt ? `Hết hạn ${fmtDate(plan.expiresAt)}` : "Không có hạn." })),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Giới hạn của gói" }),
      h(
        "table",
        { class: "table" },
        h("tbody", {}, ...FEATURES.map(([key, name]) => h("tr", {}, h("th", { scope: "row", text: name }), h("td", {}, yes(plan.limits[key])))), ...COUNTS.map(([key, name]) => h("tr", {}, h("th", { scope: "row", text: name }), h("td", { text: count(plan.limits[key]) })))),
      ),
    ),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Đơn gần đây" }),
      orders.length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              { class: "table" },
              h("thead", {}, h("tr", {}, ...["Mã", "Gói", "Số ngày", "Số tiền", "Trạng thái", "Ngày"].map((t) => h("th", { scope: "col", text: t })))),
              h("tbody", {}, ...orders.map((o) => h("tr", {}, h("td", { text: o.code }), h("td", { text: o.plan }), h("td", { text: String(o.days) }), h("td", { text: fmtMoney(o.amount, o.currency) }), h("td", { text: STATUS[o.status] ?? o.status }), h("td", { text: fmtDate(o.createdAt) })))),
            ),
          )
        : h("p", { text: "Chưa có đơn nào." }),
    ),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Cách mua" }),
      buy.stripeEnabled || buy.payosEnabled
        ? h("p", { text: `Gõ /mua trong server, chọn gói và số ngày, rồi trả bằng ${[buy.stripeEnabled && "thẻ qua Stripe", buy.payosEnabled && "QR ngân hàng Việt Nam qua payOS"].filter(Boolean).join(" hoặc ")}. Trả xong gói tự bật, khỏi nhập mã.` })
        : h("p", { text: buy.contact }),
      h("p", { text: "Có mã kích hoạt rồi thì gõ /kichhoat trong server." }),
      h("ul", { class: "plain rows" }, buy.offers.map((o) => h("li", {}, `${o.label}, ${o.days} ngày: `, h("strong", { text: buy.stripeEnabled ? fmtMoney(o.usd, "USD") : fmtMoney(o.amount) })))),
    ),
  );
}
