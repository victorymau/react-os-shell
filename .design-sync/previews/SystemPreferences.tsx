import {
  SystemPreferences,
  Customization,
  BehaviorPanel,
  SoundsPanel,
  ShellPrefsProvider,
  type SystemPreferencesSection,
  type ShellPrefsAdapter,
} from 'react-os-shell';

// SystemPreferences is a two-pane sidebar host: a list of sections on the left,
// the active section's body on the right. It renders BLANK without a real
// `sections` prop, so supply a realistic static config that mirrors how a
// portal composes its Preferences window — the shell's own panels as bodies.
const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const PREFS: Record<string, any> = {
  theme: 'blue',
  desktop_bg: 'none',
  layout_mode: 'classic',
  taskbar_position: 'bottom',
  start_menu_size: 'medium',
  menu_density: 'normal',
  window_position: 'cascade',
  desktop_dblclick: 'deactivate',
  default_window_size: 'large',
  show_desktop_version: true,
  transparency_taskbar: 70,
  transparency_active_header: 80,
  transparency_active_content: 90,
};

const adapter: ShellPrefsAdapter = { prefs: PREFS, save: () => {} };

const APPEARANCE = icon('M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42');
const LAYOUT = icon('M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z');
const BEHAVIOR = icon('M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z');
const SOUNDS = icon('M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z');

const SECTIONS: SystemPreferencesSection[] = [
  {
    key: 'appearance',
    label: 'Appearance',
    description: 'Theme, wallpaper & transparency',
    icon: APPEARANCE,
    render: () => <Customization section="appearance" />,
  },
  {
    key: 'layout',
    label: 'Layout',
    description: 'Layout mode, taskbar & menu',
    icon: LAYOUT,
    render: () => <Customization section="layout" />,
  },
  {
    key: 'behavior',
    label: 'Behavior',
    description: 'Windows, desktop & startup',
    icon: BEHAVIOR,
    render: () => <BehaviorPanel />,
  },
  {
    key: 'sounds',
    label: 'Sounds',
    description: 'Per-event sound packs',
    icon: SOUNDS,
    render: () => <SoundsPanel />,
  },
];

// Each cell pins a different default-selected section so the sheet sweeps the
// host's main axis (which body is shown on the right).
export function AppearanceSelected() {
  return (
    <ShellPrefsProvider value={adapter}>
      <div className="p-5">
        <SystemPreferences sections={SECTIONS} defaultSelected="appearance" />
      </div>
    </ShellPrefsProvider>
  );
}

export function LayoutSelected() {
  return (
    <ShellPrefsProvider value={adapter}>
      <div className="p-5">
        <SystemPreferences sections={SECTIONS} defaultSelected="layout" />
      </div>
    </ShellPrefsProvider>
  );
}

export function BehaviorSelected() {
  return (
    <ShellPrefsProvider value={adapter}>
      <div className="p-5">
        <SystemPreferences sections={SECTIONS} defaultSelected="behavior" />
      </div>
    </ShellPrefsProvider>
  );
}
