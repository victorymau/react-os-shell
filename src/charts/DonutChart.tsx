/**
 * DonutChart — a ring chart drawn with SVG stroke-dasharray segments. Segment
 * colors default to a built-in palette (override per segment). The track uses a
 * theme-agnostic translucent slate so it reads in both light and dark mode.
 */
import { type DonutChartProps } from './types';

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#a855f7', '#64748b'];

export default function DonutChart({ segments, size = 120, thickness = 16, centerLabel, className, style }: DonutChartProps) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ''}`.trim()}
      style={{ width: size, height: size, ...style }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (Math.max(0, s.value) / total) * circ;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {centerLabel != null && (
        <div className="absolute text-center text-sm font-semibold text-gray-900">{centerLabel}</div>
      )}
    </div>
  );
}
