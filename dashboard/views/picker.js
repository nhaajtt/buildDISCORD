import { h } from "../dom.js";

export function pickerView(me) {
  const root = h("section", {}, h("h1", { text: "Chọn server" }), h("p", { class: "lead", text: "Những server bạn quản lý và có thầu đứng gác." }));
  if (!me.guilds.length) {
    root.append(h("div", { class: "card" }, h("p", { text: "Chưa có server nào hợp lệ. Bạn cần quyền Quản lý server hoặc Quản trị viên, và thầu phải đã được mời vào server đó." })));
    return root;
  }
  const grid = h("ul", { class: "grid plain" });
  for (const g of me.guilds) {
    const initials = g.name.trim().slice(0, 2).toUpperCase() || "?";
    const art = g.icon
      ? h("img", { class: "g-icon", src: g.icon, alt: "", width: 56, height: 56, loading: "lazy", referrerpolicy: "no-referrer" })
      : h("span", { class: "g-icon g-fallback", "aria-hidden": "true", text: initials });
    grid.append(h("li", {}, h("a", { class: "card g-card", href: `#/g/${g.id}/tong-quan` }, art, h("span", { class: "g-name", text: g.name }), h("span", { class: `plan plan-${g.plan}`, text: g.planLabel }))));
  }
  root.append(grid);
  return root;
}
