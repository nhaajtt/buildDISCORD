import { h, icon, toast } from "../dom.js";
import { get, post, put } from "../api.js";
import { automodTab } from "./automod.js";
import { healthTab } from "./health.js";
import { overviewTab } from "./overview.js";
import { planTab } from "./plan.js";
import { ticketsTab } from "./tickets.js";
import { welcomeTab } from "./welcome.js";

export const TABS = [
  { id: "tong-quan", name: "Tổng quan", icon: "home", render: overviewTab },
  { id: "chao-mung", name: "Chào mừng", icon: "hand", render: welcomeTab },
  { id: "automod", name: "AutoMod", icon: "shield", render: automodTab },
  { id: "ticket", name: "Ticket", icon: "ticket", render: ticketsTab },
  { id: "suc-khoe", name: "Khám sức khoẻ", icon: "pulse", render: healthTab },
  { id: "goi", name: "Gói và thanh toán", icon: "card", render: planTab },
];

let cached = { id: null, detail: null };

// Fetches the server's data the first time, then keeps it while the person moves between tabs
export async function loadGuild(id, { force = false } = {}) {
  if (!force && cached.id === id && cached.detail) return cached.detail;
  const detail = await get(`/api/guilds/${id}`);
  cached = { id, detail };
  return detail;
}

export function guildView(id, tabId, detail, redraw) {
  const base = `/api/guilds/${id}`;
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  const run = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      toast(error.message, "err");
      return null;
    }
  };

  const ctx = {
    detail,
    save: (section, body) =>
      run(async () => {
        const result = await put(`${base}/settings/${section}`, body);
        detail.settings[section] = result.value;
        toast(result.notice ?? "Đã lưu.", result.applied === false ? "warn" : "ok");
        redraw();
        return result;
      }),
    post: () =>
      run(async () => {
        const result = await post(`${base}/tickets/panel`);
        detail.settings.tickets = result.value;
        toast(result.notice);
        redraw();
        return result;
      }),
    reload: () =>
      run(async () => {
        Object.assign(detail, await loadGuild(id, { force: true }));
        redraw();
      }),
    runAudit: () =>
      run(async () => {
        detail.audit = await post(`${base}/audit`);
        toast("Khám xong rồi, xem kết quả bên dưới.");
        redraw();
      }),
    applyFix: (fixId) =>
      run(async () => {
        const result = await post(`${base}/audit/fix`, { fixId });
        toast(result.summary, result.changed ? "ok" : "warn");
        Object.assign(detail, await loadGuild(id, { force: true }));
        redraw();
      }),
  };

  const nav = h(
    "nav",
    { class: "tabs", "aria-label": "Các phần của server" },
    h(
      "ul",
      { class: "plain" },
      TABS.map((t) => h("li", {}, h("a", { href: `#/g/${id}/${t.id}`, "aria-current": t.id === tab.id ? "page" : null }, icon(t.icon, 18), h("span", { text: t.name })))),
    ),
  );

  return h(
    "section",
    {},
    h("p", {}, h("a", { class: "back", href: "#/", text: "Đổi server" })),
    h("h1", { class: "g-title", text: detail.name }),
    nav,
    h("div", { class: "panel" }, tab.render(ctx)),
  );
}
