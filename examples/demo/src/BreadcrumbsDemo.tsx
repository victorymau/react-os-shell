import { useState } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from 'react-os-shell';

/**
 * Demo for the shell's <Breadcrumbs> primitive. Drill into folders to grow the
 * trail; click any crumb to jump back up (the last crumb is the current
 * location and is inert). Toggle "Collapse" to see `maxItems` fold the middle
 * of a long trail into an ellipsis.
 */
type Tree = { [name: string]: Tree };

const TREE: Tree = {
  Documents: {
    Projects: { 'Q3 Launch': {}, 'Roadmap 2026': {}, Archive: { '2024': {}, '2025': {} } },
    Invoices: {},
    Contracts: {},
  },
  Media: { Photos: {}, Videos: {}, Audio: {} },
  Downloads: {},
};

/** Folders directly under `path` (path[0] is the synthetic "Home" root). */
function childrenAt(path: string[]): string[] {
  let node: Tree = TREE;
  for (let i = 1; i < path.length; i++) node = node[path[i]] ?? {};
  return Object.keys(node);
}

const homeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75v9.75a.75.75 0 00.75.75H9V15a.75.75 0 01.75-.75h4.5A.75.75 0 0115 15v5.25h3.75a.75.75 0 00.75-.75V9.75" />
  </svg>
);

const folderIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5 text-amber-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

export default function BreadcrumbsDemo() {
  const [path, setPath] = useState<string[]>(['Home']);
  const [collapse, setCollapse] = useState(true);

  const children = childrenAt(path);

  const items: BreadcrumbItem[] = path.map((name, i) => ({
    label: name,
    icon: i === 0 ? homeIcon : undefined,
    // Last crumb = current location; leave it without onClick so it renders inert.
    onClick: i < path.length - 1 ? () => setPath(path.slice(0, i + 1)) : undefined,
  }));

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-gray-900">Breadcrumbs</h1>
        <button
          onClick={() => setCollapse(c => !c)}
          className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Collapse (maxItems={collapse ? 4 : 0}): {collapse ? 'on' : 'off'}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Breadcrumbs items={items} maxItems={collapse ? 4 : 0} />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        {children.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            This folder is empty.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {children.map(name => (
              <li key={name}>
                <button
                  onClick={() => setPath([...path, name])}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-blue-50"
                >
                  {folderIcon}
                  <span className="font-medium">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">
        Drill in to grow the trail (try Documents → Projects → Archive); click a crumb to jump back. With
        collapse on, a trail longer than <code>maxItems</code> folds its middle into “…”.
      </p>
    </div>
  );
}
