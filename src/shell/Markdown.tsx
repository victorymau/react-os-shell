import type { ReactNode } from 'react';

/**
 * Dependency-free Markdown renderer for help / documentation bodies.
 *
 * Supports the subset used by in-app articles: ATX headings (`##`–`####`),
 * **bold**, *italic*, `inline code`, [links](url), bullet and numbered lists
 * (with wrapped continuation lines), GitHub-style pipe **tables**, `>`
 * blockquote **callouts**, `---` rules, paragraphs, and image syntax
 * `![alt](src)` — which renders as a labelled *screenshot placeholder* box
 * (manual images may not exist yet). Unrecognised syntax degrades to plain
 * text, so author-written articles never break the page. No raw HTML is
 * interpreted.
 */

const INLINE_RE =
  /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <span key={key++} className="text-gray-400">
          [{m[1]}]
        </span>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <a
          key={key++}
          href={m[4]}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          {m[3]}
        </a>,
      );
    } else if (m[5] !== undefined) {
      out.push(
        <strong key={key++} className="font-semibold text-gray-900">
          {m[5]}
        </strong>,
      );
    } else if (m[6] !== undefined) {
      out.push(
        <code
          key={key++}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800"
        >
          {m[6]}
        </code>,
      );
    } else if (m[7] !== undefined) {
      out.push(<em key={key++}>{m[7]}</em>);
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function ScreenshotPlaceholder({ alt }: { alt: string }) {
  const label = alt.replace(/^screenshot:\s*/i, '');
  return (
    <div className="my-1 flex items-start gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h1.1l.4-.9a1 1 0 0 1 .9-.6h6.2a1 1 0 0 1 .9.6l.4.9h1.1A1.5 1.5 0 0 1 18 6v8.5A1.5 1.5 0 0 1 16.5 16h-13A1.5 1.5 0 0 1 2 14.5V6Zm7.5 1.5a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
      </svg>
      <span className="text-xs text-gray-500">
        <span className="font-medium text-gray-600">Screenshot — </span>
        {label}
      </span>
    </div>
  );
}

/** Collect list items, merging wrapped continuation lines into their item. */
function collectItems(lines: string[], itemRe: RegExp): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const m = itemRe.exec(line);
    if (m) {
      items.push(m[1]);
    } else if (items.length) {
      items[items.length - 1] += ' ' + line.trim();
    }
  }
  return items;
}

const splitCells = (line: string): string[] =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map(c => c.trim());

/** A pipe table: header row, a `---|---` separator, then body rows. */
function isTable(lines: string[]): boolean {
  return (
    lines.length >= 2 &&
    lines[0].includes('|') &&
    /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[1]) &&
    lines[1].includes('-')
  );
}

function renderTable(lines: string[], key: number): ReactNode {
  const header = splitCells(lines[0]);
  const rows = lines.slice(2).map(splitCells);
  return (
    <div key={key} className="my-1 overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50">
            {header.map((h, i) => (
              <th
                key={i}
                className="border-b border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700"
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="even:bg-gray-50/50">
              {row.map((c, i) => (
                <td key={i} className="border-t border-gray-100 px-3 py-1.5 align-top text-gray-700">
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlock(block: string, key: number): ReactNode {
  const lines = block.split('\n');
  const first = lines[0];

  const heading = /^(#{2,4})\s+(.*)$/.exec(first);
  if (heading && lines.length === 1) {
    const level = heading[1].length;
    const Tag = (`h${level}` as 'h2');
    const cls =
      level === 2
        ? 'mt-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500'
        : level === 3
          ? 'mt-1 text-base font-semibold text-gray-900'
          : 'mt-1 text-sm font-semibold text-gray-900';
    return (
      <Tag key={key} className={cls}>
        {renderInline(heading[2])}
      </Tag>
    );
  }

  if (lines.length === 1 && /^---+$/.test(first)) {
    return <hr key={key} className="border-gray-200" />;
  }

  if (isTable(lines)) {
    return renderTable(lines, key);
  }

  if (/^>\s?/.test(first)) {
    const text = lines.map(l => l.replace(/^>\s?/, '')).join(' ');
    return (
      <div
        key={key}
        className="my-1 rounded-r-lg border-l-4 border-blue-300 bg-blue-50/60 px-3 py-2 text-gray-700"
      >
        {renderInline(text)}
      </div>
    );
  }

  const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(first);
  if (img && lines.length === 1) {
    return <ScreenshotPlaceholder key={key} alt={img[1]} />;
  }

  if (/^[-*]\s+/.test(first)) {
    const items = collectItems(lines, /^[-*]\s+(.*)$/);
    return (
      <ul key={key} className="list-disc space-y-1 pl-5 marker:text-gray-400">
        {items.map((it, j) => (
          <li key={j}>{renderInline(it)}</li>
        ))}
      </ul>
    );
  }

  const ordered = /^(\d+)\.\s+/.exec(first);
  if (ordered) {
    const items = collectItems(lines, /^\d+\.\s+(.*)$/);
    return (
      <ol
        key={key}
        start={Number(ordered[1])}
        className="list-decimal space-y-1 pl-5 marker:text-gray-400"
      >
        {items.map((it, j) => (
          <li key={j} className="pl-1">
            {renderInline(it)}
          </li>
        ))}
      </ol>
    );
  }

  return <p key={key}>{renderInline(lines.join(' '))}</p>;
}

export interface MarkdownProps {
  children: string;
  className?: string;
}

export default function Markdown({ children, className }: MarkdownProps) {
  const blocks = (children ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(b => b.replace(/\s+$/, ''))
    .filter(b => b.trim() !== '');

  return (
    <div className={`space-y-3 text-sm leading-relaxed text-gray-700 ${className ?? ''}`.trim()}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}
