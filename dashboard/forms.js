import { h, icon, uid, clear } from "./dom.js";

// Form building blocks. Every control gets a real label, and hints are tied to the control with aria-describedby.

function wrap(label, control, hint, extra = "") {
  const hintId = hint ? `${control.id}-hint` : null;
  if (hintId) control.setAttribute("aria-describedby", hintId);
  return h("div", { class: `field ${extra}`.trim() }, h("label", { for: control.id, text: label }), control, hint ? h("p", { class: "hint", id: hintId, text: hint }) : null);
}

export function textField(label, value, { max = 100, hint = "", multiline = false, rows = 4, onInput } = {}) {
  const id = uid("t");
  const input = multiline ? h("textarea", { id, rows, maxlength: max }) : h("input", { id, type: "text", maxlength: max, autocomplete: "off" });
  input.value = value ?? "";
  if (onInput) input.addEventListener("input", () => onInput(input.value));
  return { root: wrap(label, input, hint), input, get: () => input.value };
}

export function numberField(label, value, { min, max, hint = "" }) {
  const id = uid("n");
  const input = h("input", { id, type: "number", min, max, step: 1, inputmode: "numeric" });
  input.value = String(value ?? "");
  return { root: wrap(label, input, hint), input, get: () => Number(input.value) };
}

export function switchField(label, checked, { hint = "", disabled = false, onChange } = {}) {
  const id = uid("s");
  const input = h("input", { id, type: "checkbox", class: "switch-input", role: "switch" });
  input.checked = Boolean(checked);
  input.disabled = disabled;
  if (onChange) input.addEventListener("change", () => onChange(input.checked));
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) input.setAttribute("aria-describedby", hintId);
  const root = h("div", { class: "field field-switch" }, h("div", { class: "switch-row" }, input, h("label", { for: id, text: label })), hint ? h("p", { class: "hint", id: hintId, text: hint }) : null);
  return { root, input, get: () => input.checked };
}

// options: [{ id, name, note?, disabled? }]. Returns the id or null for "none".
export function pickerField(label, options, value, { none = "Chưa chọn", hint = "", disabled = false, prefix = "" } = {}) {
  const id = uid("p");
  const select = h("select", { id }, h("option", { value: "", text: none }));
  for (const o of options) {
    const opt = h("option", { value: o.id, text: `${prefix}${o.name}${o.note ? ` (${o.note})` : ""}` });
    opt.disabled = Boolean(o.disabled) && o.id !== value;
    select.append(opt);
  }
  // A saved id that is no longer in the server still shows, so saving does not silently drop it
  if (value && !options.some((o) => o.id === value)) select.append(h("option", { value, text: "Không còn trong server (chọn lại)" }));
  select.value = value ?? "";
  select.disabled = disabled;
  return { root: wrap(label, select, hint), select, get: () => select.value || null };
}

export function checkList(legend, options, selected, { disabled = false, hint = "", max = 20 } = {}) {
  const chosen = new Set(selected);
  const boxes = [];
  const list = h("div", { class: "check-list" });
  for (const o of options) {
    const id = uid("c");
    const box = h("input", { id, type: "checkbox", value: o.id });
    box.checked = chosen.has(o.id);
    box.disabled = disabled;
    boxes.push(box);
    list.append(h("div", { class: "check" }, box, h("label", { for: id, text: o.name })));
  }
  if (!options.length) list.append(h("p", { class: "hint", text: "Server chưa có role nào để chọn." }));
  const root = h("fieldset", { class: "field" }, h("legend", { text: legend }), hint ? h("p", { class: "hint", text: hint }) : null, list);
  return {
    root,
    get: () => boxes.filter((b) => b.checked).map((b) => b.value).slice(0, max),
  };
}

export function lockBadge(text = "Pro") {
  return h("span", { class: "lock" }, icon("lock", 14), text);
}

export function notice(text, kind = "info") {
  return h("p", { class: `notice notice-${kind}`, text });
}

// Disables a button while an async action runs, so a double click cannot send two requests
export async function busy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Đang lưu...";
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = label;
  }
}

// A modal that lists exactly what is about to happen. Resolves true only when the person confirms.
export function confirmDialog({ title, lines, confirmLabel }) {
  return new Promise((resolve) => {
    const dialog = h("dialog", { class: "dialog", "aria-labelledby": "dlg-title" });
    const done = (answer) => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.append(
      h("h2", { id: "dlg-title", text: title }),
      h("ul", { class: "plain" }, lines.map((l) => h("li", { text: l }))),
      h("div", { class: "row end" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Thôi", onclick: () => done(false) }), h("button", { class: "btn btn-sm", type: "button", text: confirmLabel, onclick: () => done(true) })),
    );
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export { clear };
