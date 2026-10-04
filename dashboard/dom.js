// Tiny DOM helpers. Everything user-provided goes in through text nodes and property setters, never through markup strings.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value" || key === "checked" || key === "disabled" || key === "selected" || key === "hidden") el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const clear = (el) => {
  el.replaceChildren();
  return el;
};

const SVG = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const child of children) el.append(child);
  return el;
}

const PATHS = {
  check: "M4 12l5 5L20 6",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z",
  home: "M3 11l9-8 9 8M5 10v11h14V10",
  hand: "M5 12l4-8 2 5 3-6 2 7 3-3v13H6z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  ticket: "M3 8h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4zM14 8v10",
  pulse: "M3 12h4l3-7 4 14 3-7h4",
  card: "M3 6h18v12H3zM3 10h18",
  sun: "M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2",
  moon: "M20 14A8 8 0 0110 4a8 8 0 1010 10z",
  out: "M9 4H4v16h5M16 8l4 4-4 4M20 12H9",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  log: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3",
  gift: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10 4 6 5 7 8M12 8c2-4 6-3 5 0",
  list: "M4 6h16M4 12h16M4 18h10",
  mic: "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 00-4-10z",
};

export function icon(name, size = 20) {
  return svg("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, svg("path", { d: PATHS[name] ?? PATHS.check }));
}

export function toast(message, kind = "ok") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = h("p", { class: `toast toast-${kind}` }, kind === "ok" ? icon("check", 18) : null, h("span", { text: message }));
  box.append(el);
  setTimeout(() => el.remove(), kind === "ok" ? 4000 : 8000);
}

let counter = 0;
export const uid = (prefix = "f") => `${prefix}${(counter += 1)}`;

export const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "");
export const fmtMoney = (n, currency = "VND") => (currency === "USD" ? `$${Number(n).toFixed(2)}` : `${Number(n).toLocaleString("vi-VN")} đ`);
