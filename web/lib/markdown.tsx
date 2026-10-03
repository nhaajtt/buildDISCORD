import type { ReactNode } from "react";
import CodeBlock from "@/components/CodeBlock";

// A small Markdown reader for the devlog: headings, paragraphs, flat lists, tables, code fences, quotes, rules, and inline code, bold, italic and links.
export type Block =
  | { t: "h"; level: number; text: string; id: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "code"; lang: string; code: string }
  | { t: "quote"; text: string }
  | { t: "hr" };

export const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());

export function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  const unique = (base: string) => {
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({ t: "code", lang: fence[1], code: body.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({ t: "h", level: heading[1].length, text, id: unique(slug(text)) });
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push({ t: "table", head, rows });
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ t: "quote", text: body.join(" ") });
      continue;
    }
    const listMark = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMark) {
      const ordered = /\d/.test(listMark[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) {
          items.push(m[3]);
          i++;
        } else if (/^\s+\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s|\|)/.test(lines[i])) para.push(lines[i++].trim());
    if (para.length) blocks.push({ t: "p", text: para.join(" ") });
    else i++;
  }
  return blocks;
}

const inlinePattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)/g;

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    if (token.startsWith("`")) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) out.push(<strong key={key++}>{inline(token.slice(2, -2))}</strong>);
    else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      const external = /^https?:/.test(href);
      out.push(
        <a key={key++} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {label}
        </a>,
      );
    } else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Turns blocks into elements. The table that follows the heading called `statsAfter` becomes a grid of figure cards.
export function render(blocks: Block[], statsAfter = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  let stats = false;
  blocks.forEach((b, index) => {
    const key = index;
    if (b.t === "h") {
      stats = b.text === statsAfter;
      const Tag = (`h${Math.min(4, b.level + 0)}` as "h2");
      nodes.push(
        <Tag key={key} id={b.id}>
          <a className="anchor" href={`#${b.id}`} aria-label={b.text}>
            #
          </a>
          {inline(b.text)}
        </Tag>,
      );
    } else if (b.t === "p") nodes.push(<p key={key}>{inline(b.text)}</p>);
    else if (b.t === "quote") nodes.push(<blockquote key={key}>{inline(b.text)}</blockquote>);
    else if (b.t === "hr") nodes.push(<hr key={key} />);
    else if (b.t === "code") nodes.push(<CodeBlock key={key} code={b.code} lang={b.lang} />);
    else if (b.t === "ul" || b.t === "ol") {
      const List = b.t;
      nodes.push(
        <List key={key}>
          {b.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </List>,
      );
    } else if (b.t === "table") {
      if (stats && b.head.length === 2) {
        stats = false;
        nodes.push(
          <dl key={key} className="stat-grid">
            {b.rows.map((row, i) => (
              <div key={i} className="stat" data-in>
                <dd>{inline(row[1])}</dd>
                <dt>{inline(row[0])}</dt>
              </div>
            ))}
          </dl>,
        );
      } else {
        nodes.push(
          <div key={key} className="table-wrap">
            <table>
              <thead>
                <tr>
                  {b.head.map((h, i) => (
                    <th key={i}>{inline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((c, i) => (
                      <td key={i}>{inline(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
    }
  });
  return nodes;
}
