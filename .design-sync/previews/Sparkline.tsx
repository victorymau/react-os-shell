import { Sparkline } from 'react-os-shell';

// Sparkline — compact trend line, optionally area-filled. Color comes from the
// parent `text-*` class (currentColor).

const SERIES = [4, 6, 5, 8, 7, 11, 9, 13, 12, 16, 14, 18];

export function LineAndArea() {
  return (
    <div className="flex items-center gap-6 p-6">
      <span className="text-blue-600"><Sparkline data={SERIES} width={140} height={36} /></span>
      <span className="text-emerald-600"><Sparkline data={SERIES} width={140} height={36} fill="rgba(16,185,129,0.15)" showDots /></span>
    </div>
  );
}
