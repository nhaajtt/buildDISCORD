import { h, svg, fmtDate } from "../dom.js";
import { busy, confirmDialog } from "../forms.js";

const SEVERITY = { cao: "Nghiêm trọng", vua: "Vừa", thap: "Nhẹ" };
const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

const tone = (score) => (score >= 80 ? "good" : score >= 55 ? "mid" : "bad");

export function scoreRing(score, size = 140) {
  const dash = (Math.max(0, Math.min(100, score)) / 100) * CIRC;
  return h(
    "div",
    { class: `ring ring-${tone(score)}`, role: "img", "aria-label": `Điểm sức khoẻ ${score} trên 100` },
    svg(
      "svg",
      { viewBox: "0 0 120 120", width: size, height: size, "aria-hidden": "true" },
      svg("circle", { class: "ring-track", cx: 60, cy: 60, r: RADIUS, fill: "none", "stroke-width": 10 }),
      svg("circle", { class: "ring-value", cx: 60, cy: 60, r: RADIUS, fill: "none", "stroke-width": 10, "stroke-linecap": "butt", "stroke-dasharray": `${dash} ${CIRC}`, transform: "rotate(-90 60 60)" }),
    ),
    h("span", { class: "ring-num", text: String(score) }),
  );
}

function history(items) {
  if (items.length < 2) return h("p", { class: "hint", text: "Khám thêm vài lần nữa thì có biểu đồ lịch sử." });
  const ordered = [...items].reverse();
  const w = 12;
  const bars = ordered.map((p, i) => svg("rect", { class: `bar bar-${tone(p.score)}`, x: i * w, y: 60 - p.score * 0.6, width: w - 3, height: Math.max(1, p.score * 0.6) }, svg("title", {}, document.createTextNode(`${p.score} điểm, ${fmtDate(p.createdAt)}`))));
  return h("figure", { class: "history" }, svg("svg", { viewBox: `0 0 ${ordered.length * w} 60`, role: "img", "aria-label": `Điểm của ${ordered.length} lần khám gần nhất, từ cũ tới mới` }, ...bars), h("figcaption", { class: "hint", text: "Điểm các lần khám gần nhất, cũ bên trái." }));
}

export function healthTab({ detail, runAudit, applyFix }) {
  const { latest, fixes, history: past } = detail.audit;
  const run = h("button", { class: "btn", type: "button", text: latest ? "Khám lại" : "Khám sức khoẻ" });
  run.addEventListener("click", () => busy(run, runAudit));
  const root = h("div", { class: "stack" }, h("h2", { text: "Khám sức khoẻ" }), h("p", { class: "lead", text: "Thầu soi quyền và cấu hình server, chỉ báo cáo, không tự sửa gì khi chưa bạn đồng ý." }), run);
  if (!latest) {
    root.append(h("p", { text: "Chưa có báo cáo nào." }));
    return root;
  }
  root.append(h("div", { class: "card center" }, scoreRing(latest.score), h("p", { class: "big", text: latest.grade }), h("p", { class: "hint", text: `Khám lúc ${fmtDate(latest.createdAt)}` })));

  const byFix = new Map(fixes.map((f) => [f.id, f]));
  for (const level of ["cao", "vua", "thap"]) {
    const group = latest.findings.filter((f) => f.severity === level);
    if (!group.length) continue;
    root.append(
      h(
        "section",
        { class: `sev sev-${level}` },
        h("h3", { text: `${SEVERITY[level]} (${group.length})` }),
        h(
          "ul",
          { class: "plain findings" },
          group.map((f) => {
            const item = h("li", { class: "card" }, h("strong", { text: f.title }), h("p", { text: f.detail }));
            const fix = f.fixId ? byFix.get(f.fixId) : null;
            if (fix) {
              const btn = h("button", { class: "btn btn-sm", type: "button", text: `Sửa: ${fix.title}` });
              btn.addEventListener("click", async () => {
                const ok = await confirmDialog({ title: "Thầu sẽ đổi đúng những thứ này", lines: [fix.change, "Chỉ gỡ bớt rủi ro, không cấp thêm quyền nào."], confirmLabel: "Đồng ý, sửa đi" });
                if (ok) await busy(btn, () => applyFix(fix.id));
              });
              item.append(btn);
            }
            return item;
          }),
        ),
      ),
    );
  }
  if (!latest.findings.length) root.append(h("p", { text: "Không có gì để chê. Server sạch như mới đổ bê tông." }));
  root.append(h("section", {}, h("h3", { text: "Lịch sử điểm" }), history(past)));
  return root;
}
