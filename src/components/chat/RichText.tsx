import { memo, type ReactNode } from 'react';
import { parseRich, type RichSpan } from '../../lib/richText';
import { highlightSegments } from '../../lib/search';

interface Props {
  text: string;
  query?: string;
  activeHighlight?: boolean;
}

function withHighlight(text: string, query: string | undefined, active: boolean, keyBase: string): ReactNode {
  if (!query) return text;
  const segs = highlightSegments(text, query);
  if (segs.length === 1 && !segs[0].match) return text;
  return segs.map((s, i) =>
    s.match ? (
      <mark key={`${keyBase}-${i}`} className={active ? 'hl hl-active' : 'hl'}>
        {s.text}
      </mark>
    ) : (
      s.text
    ),
  );
}

function renderSpan(s: RichSpan, i: number, query: string | undefined, active: boolean): ReactNode {
  let node: ReactNode = withHighlight(s.text, query, active, String(i));
  if (s.mono) node = <code className="rounded bg-ink/5 px-0.5 font-mono text-[0.92em]">{node}</code>;
  if (s.strike) node = <s>{node}</s>;
  if (s.italic) node = <em>{node}</em>;
  if (s.bold) node = <strong className="font-semibold">{node}</strong>;
  if (s.href) {
    node = (
      <a
        href={s.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className="text-[#027eb5] underline-offset-2 hover:underline dark:text-[#53bdeb]"
      >
        {node}
      </a>
    );
  }
  return <span key={i}>{node}</span>;
}

/** Message text as safe React nodes (formatting, links, search highlights). */
export const RichText = memo(function RichText({ text, query, activeHighlight = false }: Props) {
  const spans = parseRich(text);
  return <>{spans.map((s, i) => renderSpan(s, i, query, activeHighlight))}</>;
});
