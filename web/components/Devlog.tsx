import type { DevlogDoc } from "@/content/devlog";
import { REPO_URL } from "@/content/site";

export default function Devlog({ doc, home }: { doc: DevlogDoc; home: string }) {
  return (
    <main className="legal devlog">
      <a className="btn btn-ghost btn-sm" href={home}>
        {doc.back}
      </a>
      <h1 className="legal-title">{doc.title}</h1>
      <p className="legal-date">{doc.date}</p>
      <p className="lede">{doc.intro}</p>
      {doc.sections.map((section) => (
        <section key={section.h}>
          <h2>{section.h}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item.t}>
                {item.b ? <strong>{item.b} </strong> : null}
                {item.t}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="devlog-src">
        <a className="btn btn-sm" href={`${REPO_URL}/blob/main/docs/devlog.md`} target="_blank" rel="noopener noreferrer">
          {doc.source}
        </a>
      </p>
    </main>
  );
}
