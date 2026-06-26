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
