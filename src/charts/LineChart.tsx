/**
 * LineChart — a trend over time with an optional scale, legend and area fill.
 * Sparkline's big sibling: multi-series, container-filling width, still
 * dependency-free inline SVG themed by `currentColor`.
 *
 * The plot stretches (`viewBox 0 0 100 100`, `preserveAspectRatio="none"`) so
 * it can fill whatever the dashboard gives it; `vector-effect:
 * non-scaling-stroke` keeps the lines a uniform screen-space width under that
 * stretch, and the dots are zero-length round-capped strokes for the same
 * reason — a stretched `<circle>` is an ellipse.
 *
 * Like the other charts this is decorative (`aria-hidden`): the numbers it
 * draws should also exist as text somewhere on the page.
 */
import { type LineChartProps, type LineChartSeries } from './types';

function toPoints(data: number[], min: number, span: number): [number, number][] {
  // A single point has no slope — draw a flat line across the full width.
  if (data.length === 1) return [[0, 100 - ((data[0] - min) / span) * 100], [100, 100 - ((data[0] - min) / span) * 100]];
  return data.map((v, i) => [(i * 100) / (data.length - 1), 100 - ((v - min) / span) * 100]);
}

function pathFor(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function LineChart({
  series, labels, height = 160, strokeWidth = 2, showDots = false,
  max, min, showScale = false, showLegend = false, className, style,
}: LineChartProps) {
  const drawn = series.filter(s => s.data.length > 0);
  if (drawn.length === 0) return null;
  const all = drawn.flatMap(s => s.data);
  const top = max ?? Math.max(...all);
  const bottom = min ?? Math.min(...all);
  const span = top - bottom || 1;
  const color = (s: LineChartSeries) => s.color ?? 'currentColor';

  return (
    <div className={className} style={style}>
      {showLegend && drawn.some(s => s.label) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {drawn.map((s, i) => s.label && (
            <span key={i} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color(s) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="flex">
        {showScale && (
          <div className="flex flex-col justify-between pr-1.5 text-right text-[10px] leading-none text-gray-400" style={{ height }}>
            <span>{fmt(top)}</span>
            <span>{fmt(bottom + span / 2)}</span>
            <span>{fmt(bottom)}</span>
          </div>
        )}
        <svg
          className="min-w-0 flex-1"
          width="100%"
          height={height}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-hidden="true"
        >
          {showScale && [0, 50, 100].map(y => (
            <line key={y} x1={0} y1={y} x2={100} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {drawn.map((s, si) => {
            const pts = toPoints(s.data, bottom, span);
            const line = pathFor(pts);
            return (
              <g key={si}>
                {s.fill && <path d={`${line} L100,100 L0,100 Z`} fill={s.fill} stroke="none" />}
                <path d={line} fill="none" stroke={color(s)} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {showDots && s.data.length > 1 && pts.map(([x, y], i) => (
                  <path key={i} d={`M${x.toFixed(2)},${y.toFixed(2)} h0.01`} stroke={color(s)} strokeWidth={strokeWidth * 2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke">
                    <title>{`${labels?.[i] != null ? `${labels[i]}: ` : ''}${s.label ? `${s.label} ` : ''}${s.data[i]}`}</title>
                  </path>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {labels && (
        <div className={`mt-1 flex justify-between ${showScale ? 'pl-6' : ''}`}>
          {labels.map((l, i) => (
            <div key={i} className="truncate text-[10px] text-gray-400">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
