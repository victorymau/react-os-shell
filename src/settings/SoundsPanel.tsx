import { useState } from 'react';
import { ModalActions } from '../shell/Modal';
import {
  SOUND_PACKS,
  SOUND_PACK_KEYS,
  SOUND_TYPES,
  SOUND_TYPE_LABELS,
  getSoundConfig,
  setSoundForType,
  setAllSounds,
  soundsEnabled,
  previewSound,
  type SoundType,
} from '../utils/sounds';

/**
 * Standalone Sounds settings panel — sound effects toggle + per-event
 * sound-pack picker. Reads/writes the shell's `erp_sounds` and
 * `erp_sound_config` localStorage keys. Plays a preview when a pack is
 * picked. Suitable as a section in `SystemPreferences` or rendered
 * standalone.
 */
export default function SoundsPanel() {
  const [enabled, setEnabled] = useState(soundsEnabled());
  const [config, setConfig] = useState(getSoundConfig());

  const update = (soundType: SoundType, packKey: string) => {
    setSoundForType(soundType, packKey);
    setConfig(getSoundConfig());
    previewSound(packKey, soundType);
  };

  const applyAll = (packKey: string) => {
    setAllSounds(packKey);
    setConfig(getSoundConfig());
    previewSound(packKey, 'success');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Sounds</h3>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            localStorage.setItem('erp_sounds', String(e.target.checked));
            setEnabled(e.target.checked);
          }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-700">Sound effects</span>
      </label>

      {enabled && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 w-24"></th>
                {SOUND_PACK_KEYS.map(key => (
                  <th key={key} className="px-1 py-1.5 text-center">
                    <button
                      onClick={() => applyAll(key)}
                      className="font-medium text-gray-500 hover:text-blue-600 transition-colors"
                    >
                      {SOUND_PACKS[key].label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SOUND_TYPES.map(soundType => (
                <tr key={soundType}>
                  <td className="px-2 py-1.5 text-gray-700 font-medium">{SOUND_TYPE_LABELS[soundType]}</td>
                  {SOUND_PACK_KEYS.map(packKey => (
                    <td key={packKey} className="px-1 py-1.5 text-center">
                      <button
                        onClick={() => update(soundType, packKey)}
                        aria-label={`${SOUND_TYPE_LABELS[soundType]} — ${SOUND_PACKS[packKey].label}`}
                        aria-pressed={config[soundType] === packKey}
                        className={`w-4 h-4 rounded-full border-2 transition-colors ${
                          config[soundType] === packKey
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalActions>
        <span className="text-xs text-gray-400">Changes are saved automatically</span>
      </ModalActions>
    </div>
  );
}
