import type { ReactNode } from 'react';

/**
 * The five shapes that carry meaning on a timeline, plus the flag that opens
 * one.
 *
 * Their own file because two places draw them and they must agree: the dots on
 * the rail, and the legend chips under it. A legend drawn from its own copy of
 * the paths is a legend that can describe a shape the track no longer uses —
 * which is what the chip row did before it was a chip row, with a rotated
 * square standing in for both a shipment and an inspection.
 */
export type TimelineGlyphName = 'check' | 'doc' | 'flask' | 'flag' | 'truck';

const PATHS: Record<TimelineGlyphName, ReactNode> = {
  // Completion.
  check: (
    <path d="M2.6 6.3 4.9 8.6 9.4 3.6" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" />
  ),
  // A drawing revision.
  doc: (
    <>
      <path d="M3.5 1.9h3.4l2 2v6.2H3.5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.1 6.5h2.8M5.1 8.2h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  // A test, a sign-off, a QC inspection.
  flask: (
    <path d="M4.6 1.8h2.8M5.4 1.8v3.1L3.3 9.3a.9.9 0 0 0 .8 1.3h3.8a.9.9 0 0 0 .8-1.3L6.6 4.9V1.8"
      fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  ),
  /**
   * Goods moving — a shipment.
   *
   * A box, a cab and two wheels, because the diamond alone was not saying it:
   * every kind on the bar is painted in the one accent now and the GLYPH is what
   * tells them apart, so the shipment was a plain accent lozenge among accent
   * discs. Wheels as filled dots rather than outlined circles — at the 9 px a
   * diamond gives its glyph, a 0.9 px ring closes up into a blob.
   */
  truck: (
    <>
      <path d="M1.8 2.9h4.9v4.4H1.8z" fill="none" stroke="currentColor" strokeWidth="1.2"
        strokeLinejoin="round" />
      <path d="M6.7 4.4h1.6l1.5 1.7v1.2H6.7z" fill="none" stroke="currentColor" strokeWidth="1.2"
        strokeLinejoin="round" />
      <circle cx="3.5" cy="8.7" r="1" fill="currentColor" />
      <circle cx="8.4" cy="8.7" r="1" fill="currentColor" />
    </>
  ),
  // The opening milestone.
  flag: (
    <>
      <path d="M3.8 1.7v8.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.8 2.5h4.8L7.5 4.4l1.1 1.9H3.8z" fill="currentColor" />
    </>
  ),
};

/** One glyph, sized by whatever draws it. Always decorative: the thing it sits
 *  inside carries the accessible name. */
export function TimelineGlyph({ name }: { name: TimelineGlyphName }) {
  return <svg viewBox="0 0 12 12" aria-hidden="true">{PATHS[name]}</svg>;
}

/** The icon beside a milestone card's title — a flag on a mast. */
export function TimelineMilestoneIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.2 2.2v11.6" />
      <path d="M4.2 3.1h7.4l-1.6 2.5 1.6 2.6H4.2z" />
    </svg>
  );
}

/** The icon beside a production card's title — a rising bar chart. */
export function TimelineProgressIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round">
      <path d="M2.8 11.6V8.2M6.6 11.6V5.4M10.4 11.6V7M14.2 11.6V3.6" />
    </svg>
  );
}
