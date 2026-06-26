import { SoundsPanel } from 'react-os-shell';

// SoundsPanel is self-contained: it reads the `erp_sounds` /
// `erp_sound_config` localStorage keys via its own hooks. By default sound
// effects are enabled and every event maps to the "classic" pack, so it
// renders the full per-event sound-pack picker table out of the box. State is
// internal (localStorage), so there is no prop axis to sweep — one canonical
// story.
export function Default() {
  return (
    <div className="p-5">
      <SoundsPanel />
    </div>
  );
}
