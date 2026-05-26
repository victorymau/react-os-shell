import { useShellPrefs } from '../shell/ShellPrefs';
import { ModalActions } from '../shell/Modal';

const WINDOW_POSITIONS = [
  { key: 'center', label: 'Center' },
  { key: 'cascade', label: 'Cascade' },
];

const DESKTOP_DBLCLICK = [
  { key: 'deactivate', label: 'Deactivate all' },
  { key: 'nothing', label: 'Do nothing' },
];

const WINDOW_SIZES = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
  { key: 'maximized', label: 'Maximized' },
];

/**
 * Standalone Behavior settings panel — window position, double-click,
 * default window size, plus the two desktop-related toggles
 * (Show version on desktop, Enter full screen mode automatically).
 *
 * Reads/writes shell prefs via `useShellPrefs()`. Suitable for use as a
 * section in `SystemPreferences` or rendered standalone.
 */
export default function BehaviorPanel() {
  const { prefs, save } = useShellPrefs();
  const savePref = (key: string, value: any) => save({ [key]: value });

  const windowPosition: string = prefs.window_position || 'cascade';
  const desktopDblclick: string = prefs.desktop_dblclick || 'deactivate';
  const defaultWindowSize: string = prefs.default_window_size || 'large';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Behavior</h3>
        <div className="space-y-3">
          <Row
            label="New window position"
            options={WINDOW_POSITIONS}
            value={windowPosition}
            onChange={v => savePref('window_position', v)}
          />
          <Row
            label="Double-click desktop"
            options={DESKTOP_DBLCLICK}
            value={desktopDblclick}
            onChange={v => savePref('desktop_dblclick', v)}
          />
          <Row
            label="Default window size"
            options={WINDOW_SIZES}
            value={defaultWindowSize}
            onChange={v => savePref('default_window_size', v)}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Desktop</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.show_desktop_version ?? true}
            onChange={e => savePref('show_desktop_version', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">Show version on desktop</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer mt-2">
          <input
            type="checkbox"
            checked={prefs.auto_fullscreen ?? false}
            onChange={e => savePref('auto_fullscreen', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">Enter full screen mode automatically</span>
          <span className="text-xs text-gray-400 ml-1">— on login</span>
        </label>
      </div>

      <ModalActions>
        <span className="text-xs text-gray-400">Changes are saved automatically</span>
      </ModalActions>
    </div>
  );
}

function Row({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700 w-40 shrink-0">{label}</span>
      <div className="flex gap-2">
        {options.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              value === o.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
