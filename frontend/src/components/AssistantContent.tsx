import type { ReactNode } from "react";

const pricePattern = /((?:\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:₫|đ|VNĐ|VND))/giu;
const exactPricePattern = /^(?:\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:₫|đ|VNĐ|VND)$/iu;

function PriceText({ children }: { children: string }) {
  return children.split(pricePattern).map((part, index) =>
    exactPricePattern.test(part) ? (
      <strong
        key={index}
        className="price-highlight inline-block border px-1.5 py-0.5 font-bold"
      >
        {part}
      </strong>
    ) : (
      part
    )
  );
}

function InlineContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-bold text-slate-950">
        <PriceText>{part.slice(2, -2)}</PriceText>
      </strong>
    ) : (
      <PriceText key={index}>{part}</PriceText>
    )
  );
}

export function AssistantContent({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const heading = line.match(/^#{1,3}\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    const note = line.match(/^\*([^*].*)\*$/);

    if (heading) {
      blocks.push(
        <h4
          key={index}
          className="mt-3 text-sm font-semibold text-slate-950 first:mt-0"
        >
          <InlineContent text={heading[1]} />
        </h4>
      );
    } else if (bullet) {
      blocks.push(
        <div key={index} className="flex gap-2 border-l-2 border-brand pl-3 text-sm">
          <span className="font-bold text-blue-700">·</span>
          <p className="min-w-0 font-sans">
            <InlineContent text={bullet[1]} />
          </p>
        </div>
      );
    } else if (numbered) {
      blocks.push(
        <div key={index} className="flex gap-2 border-l-2 border-brand pl-3 text-sm">
          <span className="font-bold text-blue-700">
            {numbered[1]}
          </span>
          <p className="min-w-0 font-sans">
            <InlineContent text={numbered[2]} />
          </p>
        </div>
      );
    } else if (note) {
      blocks.push(
        <aside
          key={index}
          className="flex gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
        >
          <span className="font-sans font-bold text-amber-700">!</span>
          <p className="min-w-0">
            <InlineContent text={note[1]} />
          </p>
        </aside>
      );
    } else {
      blocks.push(
        <p key={index} className="font-sans">
          <InlineContent text={line} />
        </p>
      );
    }
  });

  return <div className="assistant-copy space-y-2 break-words">{blocks}</div>;
}
