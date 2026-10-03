import { h, icon, toast } from "./dom.js";
import { ApiError, get, onUnauthenticated, setCsrf } from "./api.js";
import { loginView } from "./views/login.js";
import { pickerView } from "./views/picker.js";
import { guildView, loadGuild } from "./views/guild.js";

const main = document.getElementById("main");
const top = document.getElementById("top");
let me = null;

// ----- theme: follows the system until the person picks one -----
const KEY = "thau-theme";
const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const applyTheme = (theme) => {
  if (theme) document.documentElement.dataset.theme = theme;
};
applyTheme(stored());
const currentTheme = () => document.documentElement.dataset.theme ?? (prefersDark() ? "dark" : "light");

// ----- header -----
function drawHeader() {
  const dark = currentTheme() === "dark";
  const toggle = h("button", { class: "icon-btn", type: "button", "aria-label": dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối" }, icon(dark ? "sun" : "moon", 18));
  toggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // a blocked storage only means the choice is not remembered
    }
    drawHeader();
  });
  const user = me
    ? [
        me.user.avatarUrl ? h("img", { class: "avatar", src: me.user.avatarUrl, alt: "", width: 28, height: 28, referrerpolicy: "no-referrer" }) : null,
        h("span", { class: "user-name", text: me.user.name }),
        h("a", { class: "icon-btn", href: "/auth/logout", "aria-label": "Đăng xuất" }, icon("out", 18)),
      ]
    : [];
  top.replaceChildren(h("a", { class: "brand", href: "#/" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), "THẦU XÂY DỰNG"), h("div", { class: "top-end" }, ...user, toggle));
}

function show(node, title) {
  main.replaceChildren(node);
  document.title = title ? `${title} | Bảng điều khiển Thầu` : "Bảng điều khiển Thầu";
}

function problem(error, retry) {
  const box = h("div", { class: "card" }, h("p", { class: "notice notice-err", text: error.message }));
  if (retry) box.append(h("button", { class: "btn btn-sm", type: "button", text: "Thử lại", onclick: retry }));
  return box;
}

async function boot() {
  try {
    me = await get("/api/me");
    setCsrf(me.csrf);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      drawHeader();
      show(problem(error, () => location.reload()), "Lỗi");
      return false;
    }
    me = null;
  }
  drawHeader();
  return Boolean(me);
}

let token = 0;
async function route() {
  const mine = (token += 1);
  if (!me) {
    show(loginView(), "Đăng nhập");
    return;
  }
  const [, kind, id, tab] = (location.hash.replace(/^#/, "") || "/").split("/");
  if (kind !== "g" || !/^\d{17,20}$/.test(id ?? "")) {
    show(pickerView(me), "Chọn server");
    main.focus({ preventScroll: true });
    return;
  }
  const render = async () => {
    show(h("p", { class: "loading", text: "Đang đổ bê tông..." }));
    try {
      const detail = await loadGuild(id);
      if (mine !== token) return;
      const redraw = () => {
        if (mine !== token) return;
        const y = window.scrollY;
        show(guildView(id, tab, detail, redraw), detail.name);
        window.scrollTo(0, y);
      };
      show(guildView(id, tab, detail, redraw), detail.name);
      main.focus({ preventScroll: true });
    } catch (error) {
      if (mine === token && !(error instanceof ApiError && error.status === 401)) show(problem(error, render), "Lỗi");
    }
  };
  await render();
}

onUnauthenticated(() => {
  if (!me) return;
  me = null;
  drawHeader();
  show(loginView("Phiên đăng nhập đã hết hạn, đăng nhập lại nhé."), "Đăng nhập");
  toast("Phiên đăng nhập đã hết hạn.", "warn");
});

window.addEventListener("hashchange", route);
await boot();
await route();
