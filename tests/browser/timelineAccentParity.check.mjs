import assert from 'node:assert/strict';

export const describe = 'the timeline is the theme accent, and it is flat';

/**
 * Henry, 2026-09-14 (translated from his Chinese ruling): "The timeline's blue
 * is not our theme blue; it must be the theme colour, and pure flat blue — no
 * skeuomorphic shading — consistent with everything else."
 *
 * `tests/timelineTokens.test.ts` proves the stylesheet SAYS so. This proves the
 * browser AGREES, which is a different claim and the one Henry actually made.
 * The theme's blue arrives by three different routes on this page — a Tailwind
 * v4 OKLCH variable behind `.bg-blue-600`, an inline `var(--tl-*)` on a kind
 * mark, and, under a custom accent, an inline property on <html> that only the
 * remaps listed in `themes.css` reach. Only a real engine can say whether the
 * three land on one value.
 *
 * The reference is a primary `Button` rendered on the same page — the kit's own
 * statement of what the theme's blue is — so the assertion cannot go stale
 * against a palette change.
 */

/** The three parts of the bar the ruling is about, and what draws each. */
const PARTS = [
  // The rail fill: `.bg-blue-600`, the same utility the Button wears.
  ['the rail fill', '[data-timeline-part="fill"]'],
  // "You are here": also `.bg-blue-600`, whatever kind the mark belongs to.
  ['the current mark', '.rosh-tl-node.is-current'],
  // A shipment: an inline `background-color: var(--tl-shipment)` — the token
  // route rather than the utility one. The diamond is unique to it here.
  ['a shipment mark', '.rosh-tl-node.is-diamond'],
];

const BUTTON = '[data-testid="reference-button"] button';

async function backgroundOf(page, selector) {
  await page.waitForSelector(selector);
  return page.$eval(selector, (el) => getComputedStyle(el).backgroundColor);
}

/** Every part's computed background must equal the primary Button's. Returns
 *  that shared value, so the caller can compare it across themes. */
async function assertParity(page, label) {
  const button = await backgroundOf(page, BUTTON);
  assert.notEqual(
    button, 'rgba(0, 0, 0, 0)',
    `${label}: the reference Button has no background at all`,
  );
  for (const [part, selector] of PARTS) {
    const value = await backgroundOf(page, selector);
    assert.equal(
      value, button,
      `${label}: ${part} is ${value}, the primary Button is ${button} — the bar is `
      + 'not wearing the theme blue',
    );
  }
  return button;
}

export default async (page, { open }) => {
  // ── The theme's own blue, light and dark ──────────────────────────────────
  const light = await assertParity(page, 'light');

  await open('?theme=dark');
  const dark = await assertParity(page, 'dark');
  assert.equal(
    dark, light,
    'the accent fill moved between themes — `.bg-blue-600` carries no dark remap, '
    + 'so neither may the bar',
  );

  // ── A custom accent: all three follow it ──────────────────────────────────
  // #7c3aed is violet, and nothing in the blue palette is near it: a part that
  // failed to follow shows up as a blue among three violets rather than as a
  // shade nobody can see.
  await open('?accent=%237c3aed');
  const custom = await assertParity(page, 'a custom accent');
  assert.equal(
    custom, 'rgb(124, 58, 237)',
    `a custom accent of #7c3aed rendered as ${custom}`,
  );
  assert.notEqual(custom, light, 'the custom accent did not reach the page at all');

  await open('?theme=dark&accent=%237c3aed');
  const customDark = await assertParity(page, 'a custom accent in dark');
  assert.equal(customDark, custom, 'the custom accent moved between themes');

  // ── Flat ─────────────────────────────────────────────────────────────────
  await open();
  const flat = await page.evaluate(() => {
    const fill = document.querySelector('[data-timeline-part="fill"]');
    const thumb = document.querySelector('[data-timeline-part="thumb"]');
    return {
      fillImage: getComputedStyle(fill).backgroundImage,
      gloss: getComputedStyle(fill, '::after').content,
      thumbShadow: getComputedStyle(thumb).boxShadow,
    };
  });
  assert.equal(flat.fillImage, 'none', 'the fill is painted with a gradient again');
  assert.equal(flat.gloss, 'none', "the fill's white gloss overlay is back");

  // What is left on the thumb is the flat 4px ring in the card's own ground:
  // offset 0 0, blur 0, spread 4px. A drop shadow means a non-zero offset or a
  // non-zero blur, so read the lengths rather than matching the whole string —
  // the engine writes the colour first and the order is not ours to assume.
  const lengths = [...flat.thumbShadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  assert.equal(lengths.length, 4, `unexpected thumb box-shadow: ${flat.thumbShadow}`);
  assert.deepEqual(
    lengths.slice(0, 3), [0, 0, 0],
    `the scrubber thumb has a drop shadow again: ${flat.thumbShadow}`,
  );
  assert.equal(lengths[3], 4, `the thumb lost its flat surface ring: ${flat.thumbShadow}`);
};
