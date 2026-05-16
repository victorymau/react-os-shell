/**
 * Mobile app switcher — Chrome-tab-style snapshot grid of open apps.
 * Tapping a card brings that window forward + switches to 'app' mode.
 * The X on each card closes the corresponding window.
 *
 * Reuses <ThumbCard> from WindowManager which already handles the snapshot
 * cloning and aspect-ratio sizing.
 */
import { useEffect, useState } from 'react';
import { ThumbCard, type MinimizedItem } from './WindowManager';

interface MobileSwitcherProps {
  windows: MinimizedItem[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
}

export default function MobileSwitcher({ windows, onActivate, onClose, onCloseAll }: MobileSwitcherProps) {
  // Cards size based on viewport — half the screen width, two columns with gap.
  const [cardSize, setCardSize] = useState(() => computeCardSize());

  useEffect(() => {
    const onResize = () => setCardSize(computeCardSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (windows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-white/80 px-6 text-center">
        <svg className="h-12 w-12 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" />
        </svg>
        <p className="text-sm">No open apps.</p>
        <p className="text-xs text-white/50">Tap Home to launch one.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
        <h1 className="text-white text-base font-semibold mb-3 px-1">Open apps · {windows.length}</h1>
        <div className="grid grid-cols-2 gap-3">
          {windows.map(w => (
            <div key={w.id} className="group flex flex-col items-stretch gap-1">
              <ThumbCard
                id={w.id}
                label={w.label}
                maxW={cardSize.w}
                maxH={cardSize.h}
                titleAbove
                onClick={() => onActivate(w.id)}
                onClose={() => onClose(w.id)}
              />
              <span className="text-[11px] text-white/80 truncate px-1">{w.label}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Close-all bar — sits just above the bottom nav. The switcher's outer
       *  paddingBottom already reserves space for the nav; this bar slots
       *  above that reservation. */}
      <div className="shrink-0 px-3 py-3 flex justify-center">
        <button
          onClick={onCloseAll}
          className="px-5 py-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-sm font-medium active:bg-white/25 shadow-lg"
        >
          Close All
        </button>
      </div>
    </div>
  );
}

function computeCardSize() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 360;
  const h = typeof window !== 'undefined' ? window.innerHeight : 640;
  // 2 columns with 12px gap on each side and 12px between
  const cardW = Math.max(120, Math.floor((w - 36) / 2));
  // Cap card height to ~40% of viewport so multiple rows are visible
  const cardH = Math.min(cardW * 1.4, Math.floor(h * 0.4));
  return { w: cardW, h: cardH };
}
