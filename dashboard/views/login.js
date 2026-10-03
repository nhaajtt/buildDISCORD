import { h } from "../dom.js";

export function loginView(message) {
  return h(
    "section",
    { class: "login card" },
    h("h1", { text: "Bảng điều khiển của Thầu" }),
    h("p", { class: "lead", text: "Chỉnh chào mừng, AutoMod, ticket và khám sức khoẻ cho server ngay trên trình duyệt, khỏi gõ lệnh." }),
    message ? h("p", { class: "notice notice-warn", text: message }) : null,
    h("a", { class: "btn", href: "/auth/login", text: "Đăng nhập bằng Discord" }),
    h("p", { class: "hint", text: "Thầu chỉ đọc tên, ảnh và danh sách server của bạn, rồi thu hồi quyền ngay sau khi đăng nhập. Chỉ admin của server mới chỉnh được." }),
  );
}
