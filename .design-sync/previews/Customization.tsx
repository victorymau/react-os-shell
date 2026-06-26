import { Customization, ShellPrefsProvider, type ShellPrefsAdapter } from 'react-os-shell';

// Customization reads/writes shell prefs via useShellPrefs(). Without a
// provider the panel still renders but every value reads empty. Wrap it in a
// ShellPrefsProvider with a fixed (static) prefs object so the picker shows a
// realistic selected theme, taskbar position and transparency levels.
const adapter = (prefs: Record<string, any>): ShellPrefsAdapter => ({
  prefs,
  save: () => {},
});

const APPEARANCE_PREFS = {
  theme: 'blue',
  desktop_bg: 'none',
  transparency_taskbar: 70,
  transparency_start_menu: 70,
  transparency_inactive_header: 70,
  transparency_inactive_content: 80,
  transparency_active_header: 80,
  transparency_active_content: 90,
};

const LAYOUT_PREFS = {
  layout_mode: 'classic',
  taskbar_position: 'bottom',
  start_menu_size: 'medium',
  menu_density: 'normal',
};

export function Appearance() {
  return (
    <ShellPrefsProvider value={adapter(APPEARANCE_PREFS)}>
      <div className="p-5">
        <Customization section="appearance" />
      </div>
    </ShellPrefsProvider>
  );
}

export function Layout() {
  return (
    <ShellPrefsProvider value={adapter(LAYOUT_PREFS)}>
      <div className="p-5">
        <Customization section="layout" />
      </div>
    </ShellPrefsProvider>
  );
}

export function Behavior() {
  return (
    <ShellPrefsProvider value={adapter({
      window_position: 'cascade',
      desktop_dblclick: 'deactivate',
      default_window_size: 'large',
      show_desktop_version: true,
      auto_fullscreen: false,
    })}>
      <div className="p-5">
        <Customization section="behavior" />
      </div>
    </ShellPrefsProvider>
  );
}
