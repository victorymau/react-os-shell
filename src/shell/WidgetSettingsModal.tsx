import Modal from './Modal';

export interface WidgetAppearance {
  activeOpacity: number;
  inactiveOpacity: number;
  activeBlur: number;
  inactiveBlur: number;
}

export const DEFAULT_APPEARANCE: WidgetAppearance = { activeOpacity: 70, inactiveOpacity: 50, activeBlur: 0, inactiveBlur: 0 };

export function loadAppearance(key: string): WidgetAppearance {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '');
    // Migrate old single `blur` field to activeBlur/inactiveBlur
    if (saved.blur != null && saved.activeBlur == null) {
      saved.activeBlur = saved.blur;
      saved.inactiveBlur = saved.blur;
      delete saved.blur;
    }
    return { ...DEFAULT_APPEARANCE, ...saved };
  }
  catch { return DEFAULT_APPEARANCE; }
}

/** Reusable settings modal for widgets — renders appearance sliders + optional extra content above */
export default function WidgetSettingsModal({ open, onClose, title, appearance, onAppearanceChange, onSave, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  appearance: WidgetAppearance;
  onAppearanceChange: (a: WidgetAppearance) => void;
  onSave: () => void;
  children?: React.ReactNode;
}) {
  if (!open) return null;

  const inp = 'w-full h-1.5 rounded-full appearance-none bg-gray-200 cursor-pointer accent-blue-500';
  const lbl = 'flex items-center justify-between text-xs text-gray-500';

  return (
    <div onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {children}

        {/* Appearance */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Appearance</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2">Active</div>
              <div className="space-y-2">
                <div>
                  <div className={lbl}><span>Opacity</span><span>{appearance.activeOpacity}%</span></div>
                  <input type="range" min={20} max={100} value={appearance.activeOpacity}
                    onChange={e => onAppearanceChange({ ...appearance, activeOpacity: +e.target.value })} className={inp} />
                </div>
                <div>
                  <div className={lbl}><span>Blur</span><span>{appearance.activeBlur}px</span></div>
                  <input type="range" min={0} max={20} value={appearance.activeBlur}
                    onChange={e => onAppearanceChange({ ...appearance, activeBlur: +e.target.value })} className={inp} />
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2">Inactive</div>
              <div className="space-y-2">
                <div>
                  <div className={lbl}><span>Opacity</span><span>{appearance.inactiveOpacity}%</span></div>
                  <input type="range" min={20} max={100} value={appearance.inactiveOpacity}
                    onChange={e => onAppearanceChange({ ...appearance, inactiveOpacity: +e.target.value })} className={inp} />
                </div>
                <div>
                  <div className={lbl}><span>Blur</span><span>{appearance.inactiveBlur}px</span></div>
                  <input type="range" min={0} max={20} value={appearance.inactiveBlur}
                    onChange={e => onAppearanceChange({ ...appearance, inactiveBlur: +e.target.value })} className={inp} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button onClick={onSave}
            className="flex-1 text-sm font-medium py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">Save</button>
          <button onClick={onClose}
            className="flex-1 text-sm font-medium py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">Cancel</button>
        </div>
      </div>
    </Modal>
    </div>
  );
}
