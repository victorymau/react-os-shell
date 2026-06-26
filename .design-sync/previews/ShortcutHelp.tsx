import { useEffect } from 'react';
import { ShortcutHelp } from 'react-os-shell';

// ShortcutHelp is the frosted overlay listing global / list / form hotkeys.
// It mounts closed and toggles open on the `toggle-shortcut-help` document
// event (or the `?` key). For a static preview we dispatch that event once on
// mount so the panel is open and fully visible. The Dialog renders fixed
// inset-0, so it fills and is captured at the card viewport.
export function Overlay() {
  useEffect(() => {
    document.dispatchEvent(new Event('toggle-shortcut-help'));
  }, []);

  return (
    <div className="p-5">
      <ShortcutHelp />
    </div>
  );
}
