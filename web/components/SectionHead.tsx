import SplitText from "./SplitText";

// A section title that rises word by word, with a drawn dimension line under it that carries the section's name
export default function SectionHead({ id, title, lede, label, as = "h2" }: { id: string; title: string; lede?: string; label: string; as?: "h1" | "h2" }) {
  return (
    <header className="sec-head">
      <SplitText as={as} id={id} className="section-title reveal" text={title} />
      <div className="dim" aria-hidden="true">
        <span className="dim-line" />
        <span className="dim-label">{label}</span>
      </div>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}
