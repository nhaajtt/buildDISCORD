import { h, fmtDate } from "../dom.js";

const num = (n) => Number(n ?? 0).toLocaleString("vi-VN");

// Read only: what happened in the last seven days and who is leading. Nothing on this tab can change anything.
export function hoatdongTab({ detail }) {
  const o = detail.overview;
  const stat = (label, value) => h("article", { class: "card center" }, h("h3", { text: label }), h("p", { class: "big", text: num(value) }));
  return h(
    "div",
    { class: "stack" },
    h("h2", { text: "Hoạt động" }),
    h("p", { class: "hint", text: "Số liệu 7 ngày gần nhất. Thầu chỉ đếm, không đọc nội dung tin nhắn của ai." }),
    h(
      "div",
      { class: "cards" },
      stat("Người mới vào", o.week.joins),
      stat("Ticket đã mở", o.week.ticketsOpened),
      stat("Ticket đã đóng", o.week.ticketsClosed),
      stat("Tin bị AutoMod chặn", o.week.automodBlocks),
    ),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Điểm hoạt động" }),
      h("p", {}, "Thành viên đã có điểm: ", h("strong", { text: num(o.members.tracked) })),
      h("p", {}, "Tổng số tin được tính: ", h("strong", { text: num(o.members.messages) })),
      h("p", {}, "Tổng phút ở phòng thoại: ", h("strong", { text: num(o.members.voiceMinutes) })),
    ),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Top 5 hoạt động nhất" }),
      o.top.length
        ? h(
            "ol",
            { class: "rows plain" },
            o.top.map((t, i) => h("li", {}, h("strong", { text: `${i + 1}. ` }), `${t.name ?? `Thành viên ...${t.userId.slice(-4)}`}: ${num(t.xp)} điểm, ${num(t.msgs)} tin, ${num(t.voiceMin)} phút thoại`)),
          )
        : h("p", { text: "Chưa có ai có điểm. Bật điểm hoạt động rồi chờ cả server cày." }),
    ),
    h(
      "article",
      { class: "card" },
      h("h3", { text: "Chế độ khoá" }),
      h("p", { text: o.lockdown.active ? `Đang khoá từ ${fmtDate(o.lockdown.since)} (${o.lockdown.channels} kênh). Mở khoá ở tab Bảo vệ.` : "Server bình thường, không bị khoá." }),
    ),
  );
}
