import { useMemo, useState, type ReactNode } from 'react';

/**
 * One help article. Generic shape — the consuming portal maps its own
 * help-doc records onto this before passing them in.
 */
export interface HelpCenterDoc {
  id: string;
  slug: string;
  title: string;
  body: string;
  /** Grouping key (e.g. `'getting_started'`). */
  category: string;
  /** Group header text (e.g. "Getting Started"). */
  category_label: string;
  /** When `false`, a "Draft" badge is shown. Omit for always-published docs. */
  is_published?: boolean;
}

export interface HelpCenterProps {
  docs: HelpCenterDoc[];
  loading?: boolean;
  /**
   * Category keys in display order. Categories not listed fall to the end in
   * first-seen order. Without it, groups follow first-seen order.
   */
  categoryOrder?: string[];
  /** Show the New/Edit affordances (consumer gates this on write permission). */
  canEdit?: boolean;
  onNew?: () => void;
  onEdit?: (doc: HelpCenterDoc) => void;
  /** Custom body renderer; defaults to preformatted text. */
  renderBody?: (doc: HelpCenterDoc) => ReactNode;
  emptyMessage?: string;
}

interface Group {
  key: string;
  label: string;
  docs: HelpCenterDoc[];
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * In-app help / documentation viewer. Two panes: a searchable, collapsible
 * category tree on the left, the selected article's body on the right.
 *
 * Presentational only — it holds no API or permission knowledge. The consumer
 * fetches its own help docs, maps them to `HelpCenterDoc`, and (for editors)
 * wires `canEdit` + `onNew`/`onEdit` to its own create/edit UI.
 *
 * Search is client-side: a case-insensitive substring match over title, body
 * and category label. While searching, matching groups auto-expand.
 */
export default function HelpCenter({
  docs,
  loading = false,
  categoryOrder,
  canEdit = false,
  onNew,
  onEdit,
  renderBody,
  emptyMessage = 'No help articles yet.',
}: HelpCenterProps) {
  const [query, setQuery] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // Per-category open/closed override. A category absent from the map uses its
  // default (only the selected article's group starts open).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const q = query.trim().toLowerCase();

  // Group docs by category, preserving categoryOrder then first-seen order.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const doc of docs) {
      let g = map.get(doc.category);
      if (!g) {
        g = { key: doc.category, label: doc.category_label || doc.category, docs: [] };
        map.set(doc.category, g);
      }
      g.docs.push(doc);
    }
    if (!categoryOrder?.length) return [...map.values()];
    const rank = new Map(categoryOrder.map((k, i) => [k, i]));
    return [...map.values()].sort(
      (a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity),
    );
  }, [docs, categoryOrder]);

  const matches = (doc: HelpCenterDoc) =>
    !q ||
    doc.title.toLowerCase().includes(q) ||
    doc.body.toLowerCase().includes(q) ||
    doc.category_label.toLowerCase().includes(q);

  // Groups with their docs filtered by the search query; empty groups drop out.
  const visibleGroups = useMemo<Group[]>(
    () =>
      groups
        .map(g => ({ ...g, docs: g.docs.filter(matches) }))
        .filter(g => g.docs.length > 0),
    [groups, q],
  );

  const visibleDocs = useMemo(() => visibleGroups.flatMap(g => g.docs), [visibleGroups]);

  // Keep the chosen article if it's still visible, else fall back to the first
  // visible one (so typing a query jumps to the first match).
  const selected =
    (selectedSlug ? visibleDocs.find(d => d.slug === selectedSlug) : undefined) ??
    visibleDocs[0] ??
    null;

  const isGroupOpen = (key: string) =>
    q ? true : (expanded[key] ?? key === selected?.category);

  const toggleGroup = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !isGroupOpen(key) }));

  return (
    <div className="flex h-full gap-4 px-4 py-3 min-h-0">
      <aside className="w-64 shrink-0 flex flex-col bg-white rounded-lg shadow overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Help</h2>
          {canEdit && onNew && (
            <button type="button" onClick={onNew} className="text-xs text-blue-600 hover:underline">
              + New
            </button>
          )}
        </div>

        <div className="px-2.5 py-2 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 3.36 9.85l3.14 3.15a.75.75 0 1 0 1.06-1.06l-3.15-3.14A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search help…"
              className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="px-3 py-6 text-center text-xs text-gray-400">Loading…</p>
          ) : visibleGroups.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-500">
              {q ? 'No articles match your search.' : emptyMessage}
            </p>
          ) : (
            visibleGroups.map(group => {
              const open = isGroupOpen(group.key);
              return (
                <div key={group.key} className="py-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
                  >
                    <Chevron open={open} />
                    <span className="truncate">{group.label}</span>
                  </button>
                  {open &&
                    group.docs.map(doc => {
                      const active = selected?.slug === doc.slug;
                      return (
                        <button
                          key={doc.slug}
                          type="button"
                          onClick={() => setSelectedSlug(doc.slug)}
                          className={`w-full text-left pl-8 pr-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                            active
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="truncate">{doc.title}</span>
                          {doc.is_published === false && (
                            <span className="ml-auto shrink-0 text-[10px] text-amber-600">Draft</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 bg-white rounded-lg shadow overflow-hidden flex flex-col">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-900 truncate">{selected.title}</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.category_label}
                  {selected.is_published === false && (
                    <span className="ml-2 text-amber-600">· Draft</span>
                  )}
                </p>
              </div>
              {canEdit && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(selected)}
                  className="shrink-0 text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {renderBody ? (
                renderBody(selected)
              ) : selected.body ? (
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                  {selected.body}
                </pre>
              ) : (
                <p className="text-sm text-gray-500 italic">This article has no body yet.</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-gray-500">
              {loading ? 'Loading…' : 'Pick a help article from the left.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
