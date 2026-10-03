import type { Doc } from "@/content/legal";

export default function Legal({ doc, home }: { doc: Doc; home: string }) {
  return (
    <main className="legal">
      <a className="btn btn-ghost btn-sm" href={home}>
        {doc.back}
      </a>
      <h1 className="legal-title">{doc.title}</h1>
      <p className="legal-date">{doc.updated}</p>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          {s.p.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </section>
      ))}
    </main>
  );
}
