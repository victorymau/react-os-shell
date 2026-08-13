/**
 * Shared chart types. The charts are dependency-free inline SVG/CSS — color
 * defaults to `currentColor` so a parent `text-*` class themes them, and
 * geometry comes from numeric props (not Tailwind classes), so they sidestep
 * the design-sync compiled-CSS / arbitrary-value constraints entirely.
 */
import { type CSSProperties, type ReactNode } from 'react';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Line color. Defaults to `currentColor`. */
  stroke?: string;
  /** Area fill under the line. Omit for a bare line. */
  fill?: string;
  strokeWidth?: number;
  showDots?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface BarChartProps {
  data: number[];
  /** Optional labels under each bar. */
  labels?: string[];
  height?: number;
  /** Bar color. Defaults to `currentColor`. */
  color?: string;
  /** Per-bar color overrides. */
  colors?: string[];
  /** Value mapped to a full-height bar. Defaults to the max of `data`. */
  max?: number;
  /** Gap between bars, in px. */
  gap?: number;
  className?: string;
  style?: CSSProperties;
}

export interface LineChartSeries {
  data: number[];
  /** Shown in the legend (`showLegend`) and in point tooltips. */
  label?: string;
  /** Line color. Defaults to `currentColor`. */
  color?: string;
  /** Area fill under this line. Omit for a bare line. */
  fill?: string;
}

export interface LineChartProps {
  /** One or more series drawn over the same x positions. */
  series: LineChartSeries[];
  /** X-axis labels rendered under the plot, one per data point. */
  labels?: string[];
  height?: number;
  strokeWidth?: number;
  showDots?: boolean;
  /** Value at the top of the plot. Defaults to the max across all series. */
  max?: number;
  /** Value at the bottom of the plot. Defaults to the min across all series. */
  min?: number;
  /** Max / mid / min values in a left gutter, with faint reference lines. */
  showScale?: boolean;
  /** Color-dot legend above the plot, from the series' `label`s. */
  showLegend?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface DonutSegment {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Rendered in the hole, e.g. a total. */
  centerLabel?: ReactNode;
  className?: string;
  style?: CSSProperties;
}
