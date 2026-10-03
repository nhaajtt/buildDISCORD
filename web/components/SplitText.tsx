import type { ElementType } from "react";

type Props = {
  text: string;
  as?: ElementType;
  by?: "char" | "word";
  className?: string;
  id?: string;
};

// Splits a heading for animation. The element keeps the full text as its accessible name and the pieces are hidden from assistive tech.
export default function SplitText({ text, as: Tag = "span", by = "word", className, id }: Props) {
  const words = text.split(" ");
  return (
    <Tag id={id} aria-label={text} className={className}>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span key={i}>
            <span className="w">
              {by === "char"
                ? Array.from(word).map((c, j) => (
                    <span key={j} className="u">
                      {c}
                    </span>
                  ))
                : <span className="u">{word}</span>}
            </span>
            {i < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </Tag>
  );
}
