/**
 * BarChart — a simple vertical bar chart built from CSS-sized divs (no SVG, no
 * dependency). Bar color defaults to `currentColor` (set it with a parent
 * `text-*` class) or per-bar via `colors`. Covers the decorative bar summaries
 * a dashboard needs.
 */
import { type BarChartProps } from './types';

export default function BarChart({
  data, labels, height = 120, color = 'currentColor', colors, max, gap = 6, className, style,
}: BarChartProps) {
  if (data.length === 0) return null;
  const peak = max ?? (Math.max(...data, 0) || 1);

  return (
    <div className={className} style={style}>
      <div className="flex items-end" style={{ height, gap }}>
        {data.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: '100%' }}>
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.max(0, (v / peak) * 100)}%`,
                minHeight: v > 0 ? 2 : 0,
                backgroundColor: colors?.[i] ?? color,
              }}
              title={labels?.[i] != null ? `${labels[i]}: ${v}` : String(v)}
            />
          </div>
        ))}
      </div>
      {labels && (
        <div className="mt-1 flex" style={{ gap }}>
          {labels.map((l, i) => (
            <div key={i} className="flex-1 truncate text-center text-[10px] text-gray-400">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
