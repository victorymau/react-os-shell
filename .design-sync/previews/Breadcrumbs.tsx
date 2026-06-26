import { Breadcrumbs, type BreadcrumbItem } from 'react-os-shell';

// Breadcrumbs renders a navigable trail. Every crumb but the last carries an
// onClick (a jump-back handler in a real app); the last is the current
// location and renders inert. `maxItems` folds a long trail's middle into "…".

const homeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75v9.75a.75.75 0 00.75.75H9V15a.75.75 0 01.75-.75h4.5A.75.75 0 0115 15v5.25h3.75a.75.75 0 00.75-.75V9.75" />
  </svg>
);

function trail(names: string[]): BreadcrumbItem[] {
  return names.map((label, i) => ({
    label,
    icon: i === 0 ? homeIcon : undefined,
    onClick: i < names.length - 1 ? () => {} : undefined,
  }));
}

export function FullTrail() {
  return (
    <div className="p-5">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Breadcrumbs items={trail(['Home', 'Documents', 'Projects', 'Q3 Launch'])} />
      </div>
    </div>
  );
}

export function Collapsed() {
  return (
    <div className="p-5">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Breadcrumbs
          items={trail(['Home', 'Documents', 'Projects', 'Archive', '2025', 'Roadmap 2026'])}
          maxItems={4}
        />
      </div>
    </div>
  );
}

export function ShortTrail() {
  return (
    <div className="p-5">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Breadcrumbs items={trail(['Home', 'Media'])} />
      </div>
    </div>
  );
}
