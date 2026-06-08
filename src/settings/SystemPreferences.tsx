import { useState, type ReactNode } from 'react';
import SidebarLayout from '../shell/SidebarLayout';

/** One section in the SystemPreferences sidebar. */
export interface SystemPreferencesSection {
  /** Unique key, e.g. `'notifications'`, `'customization'`. */
  key: string;
  /** Sidebar label, e.g. "Notifications". */
  label: string;
  /** Short description shown under the label in the sidebar. */
  description?: string;
  /** Sidebar icon (any ReactNode — typically a 4×4 svg). */
  icon?: ReactNode;
  /** Body renderer. Receives no args; access shell prefs via your own hook. */
  render: () => ReactNode;
}

export interface SystemPreferencesProps {
  /** Ordered sections — left sidebar lists these top-to-bottom, the matching
   *  body renders on the right. The first section is selected by default
   *  unless `defaultSelected` is supplied. */
  sections: readonly SystemPreferencesSection[];
  /** Key of the section to highlight on first render. Falls back to the first
   *  section in `sections`. */
  defaultSelected?: string;
  /** Optional className applied to the outer flex container. */
  className?: string;
}

/**
 * Two-pane settings window: a fixed sidebar of sections on the left, the
 * active section's body on the right. Consumers compose by passing
 * `sections` — each entry has a `key`, `label`, optional `icon` and
 * `description`, and a `render()` callback that returns the body JSX.
 *
 * The shell exposes ready-made panels (`Customization`, `BehaviorPanel`,
 * `SoundsPanel`) that can be used as section bodies directly; portals
 * add their own sections (notification subscriptions, delivery defaults,
 * personal formatting prefs, etc.) alongside.
 *
 * Example:
 * ```tsx
 * <SystemPreferences sections={[
 *   { key: 'notifications', label: 'Notifications', icon: <BellIcon />, render: () => <MyNotifications /> },
 *   { key: 'customization', label: 'Customization', icon: <PaintBrushIcon />, render: () => <Customization omit={['behavior','desktop']} /> },
 *   { key: 'behavior',      label: 'Behavior',      icon: <Cog6ToothIcon />,   render: () => <BehaviorPanel /> },
 *   { key: 'sounds',        label: 'Sounds',        icon: <SpeakerWaveIcon />, render: () => <SoundsPanel /> },
 * ]} />
 * ```
 */
export default function SystemPreferences({
  sections,
  defaultSelected,
  className,
}: SystemPreferencesProps) {
  const initial = defaultSelected && sections.some(s => s.key === defaultSelected)
    ? defaultSelected
    : sections[0]?.key ?? '';
  const [selected, setSelected] = useState<string>(initial);
  const active = sections.find(s => s.key === selected) ?? sections[0];

  return (
    <SidebarLayout
      storageKey="shell.systemPreferences.sidebarWidth"
      defaultWidth={240}
      minWidth={200}
      maxWidth={360}
      className={className}
      sidebarClassName="border-r border-gray-200 bg-gray-50"
      sidebar={
        <nav className="py-1.5">
          {sections.map(item => {
            const isActive = item.key === selected;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelected(item.key)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-start gap-2.5 ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                {item.icon && (
                  <span className={`mt-0.5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span
                    className={`block ${
                      isActive ? 'font-semibold text-blue-700' : 'font-medium text-gray-800'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      }
    >
      <main className="flex-1 min-w-0 overflow-auto p-4">
        {active?.render()}
      </main>
    </SidebarLayout>
  );
}
