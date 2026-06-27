import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  /** Muted line under the title. (`subtitle` is an accepted alias.) */
  description?: string;
  /** @deprecated alias for `description`. */
  subtitle?: string;
  /** Right-aligned actions. (`children` is also accepted.) */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * PageHeader — a page/section title with an optional muted description and a
 * right-aligned actions slot. Accepts both the `description`/`actions` and the
 * `subtitle`/`children` prop shapes the portals previously used locally.
 */
export default function PageHeader({ title, description, subtitle, actions, children }: PageHeaderProps) {
  const desc = description ?? subtitle;
  const right = actions ?? children;
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {desc && <p className="mt-1 text-sm text-gray-500">{desc}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
