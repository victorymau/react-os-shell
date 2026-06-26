/**
 * Sparkline — a compact trend line (optionally area-filled) drawn as inline
 * SVG. Color defaults to `currentColor`, so set the line color with a parent
 * `text-*` class. Good inside StatCards and table cells.
 */
import { type SparklineProps } from './types';

export default function Sparkline({
  data, width = 120, height = 32, stroke = 'currentColor', fill,
  strokeWidth = 1.5, showDots = false, className, style,
}: SparklineProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pad = strokeWidth + (showDots ? 2 : 0);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  // A single point has no slope — draw a flat baseline across the full width.
  const pts: [number, number][] = data.length === 1
    ? [[0, height / 2], [width, height / 2]]
    : data.map((v, i) => [(i * width) / (data.length - 1), y(v)]);
  const line = pts.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${yy.toFixed(2)}`).join(' ');
  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      {fill && <path d={area} fill={fill} stroke="none" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      {showDots && pts.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r={strokeWidth + 0.5} fill={stroke} />)}
    </svg>
  );
}
