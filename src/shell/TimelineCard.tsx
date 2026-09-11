import { Fragment, type ReactNode } from 'react';

/**
 * The chrome both timeline cards wear: a titled header, the track, and an
 * optional footer rule.
 *
 * One component rather than two title rows, because the two cards had drifted
 * into two different headings for the same kind of statement — a 12 px
 * uppercase tracked label on one and a 13 px sentence-case title on the other —
 * and a reader with both open reads them as two different features.
 *
 * The header is a sentence: an icon, a title, then the facts in a muted 12 px
 * line separated by `·`, with the subject (a reference number) in front of them
 * because that is what a reader scans the card for. Anything interactive — a
 * Play control, a "Back to …" — goes in `actions`, right-aligned, so the
 * heading itself is never a row of buttons.
 */
export interface TimelineCardProps {
  /** A 15 px decorative glyph before the title. */
  icon?: ReactNode;
  /** Sentence case, 13 px / 600. "Mould development", not "MOULD TIMELINE". */
  heading: string;
  /** The record the card is about, e.g. `001F/1813` or `SO#35489`. Rendered
   *  first in the meta line, a shade heavier than the rest of it. */
  subject?: ReactNode;
  /** The facts, joined with ` · `. Falsy entries are dropped, so a caller can
   *  write the list straight through without assembling it first. */
  meta?: ReactNode[];
  /** The right-hand slot of the header row. */
  actions?: ReactNode;
  /** Below a hairline rule: the status line and the legend. */
  footer?: ReactNode;
  children: ReactNode;
}

export default function TimelineCard({
  icon, heading, subject, meta = [], actions, footer, children,
}: TimelineCardProps) {
  const facts: ReactNode[] = [
    ...(subject ? [<b key="subject">{subject}</b>] : []),
    ...meta.filter((entry) => entry !== null && entry !== undefined && entry !== false && entry !== ''),
  ];
  return (
    <section className="rosh-tl-card border-gray-200 bg-gray-50">
      <div className="rosh-tl-head">
        {/* The sentence and the controls are two groups, not one row of five
            items: the sentence wraps inside itself when the card is narrow,
            and the controls stay in the corner instead of being pushed onto a
            line of their own by a meta line one fact too long. */}
        <div className="rosh-tl-head-main">
          {icon && <span className="rosh-tl-ico text-gray-500" aria-hidden="true">{icon}</span>}
          <h4 className="rosh-tl-title text-gray-800">{heading}</h4>
          {facts.length > 0 && (
            <p className="rosh-tl-meta text-gray-500">
              {facts.map((fact, index) => (
                // The index is the key because the list is positional: these are
                // the card's facts in order, not a collection with identities.
                <Fragment key={index}>
                  {index > 0 && <span aria-hidden="true"> · </span>}
                  {fact}
                </Fragment>
              ))}
            </p>
          )}
        </div>
        {actions && <span className="rosh-tl-head-actions">{actions}</span>}
      </div>
      {children}
      {footer && <div className="rosh-tl-foot border-gray-200">{footer}</div>}
    </section>
  );
}
