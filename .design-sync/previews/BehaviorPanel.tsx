import { BehaviorPanel, ShellPrefsProvider, type ShellPrefsAdapter } from 'react-os-shell';

// BehaviorPanel reads/writes shell prefs via useShellPrefs(); wrap it in a
// provider with a fixed prefs object so the segmented toggles render with a
// realistic selected option rather than every default.
const adapter = (prefs: Record<string, any>): ShellPrefsAdapter => ({ prefs, save: () => {} });

export function Defaults() {
  return (
    <ShellPrefsProvider value={adapter({
      window_position: 'cascade',
      desktop_dblclick: 'deactivate',
      default_window_size: 'large',
      show_desktop_version: true,
      auto_fullscreen: false,
    })}>
      <div className="p-5">
        <BehaviorPanel />
      </div>
    </ShellPrefsProvider>
  );
}

export function CenteredMaximized() {
  return (
    <ShellPrefsProvider value={adapter({
      window_position: 'center',
      desktop_dblclick: 'nothing',
      default_window_size: 'maximized',
      show_desktop_version: false,
      auto_fullscreen: true,
    })}>
      <div className="p-5">
        <BehaviorPanel />
      </div>
    </ShellPrefsProvider>
  );
}
