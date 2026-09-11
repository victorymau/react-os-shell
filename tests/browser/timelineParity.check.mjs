/**
 * The two timelines, in a browser that really lays them out.
 *
 * Every claim here is one jsdom cannot make. Lane packing is arithmetic over
 * MEASURED text, and jsdom measures nothing — every width comes back 0, so the
 * suite's static specs assert against an estimate and a 600px assumption. Which
 * means the one thing the redesign exists to fix, "no two labels overprint each
 * other", can only be checked where text has a width. The same goes for the
 * motion: a CSS animation with a stagger either lands on its final frame or it
 * does not, and `prefers-reduced-motion` either takes it away or it does not.
 *
 * Set TIMELINE_SHOTS_DIR to also save PNGs of both cards, light and dark.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const describe =
  'both timelines share one track: labels never overlap, one current step, motion settles, reduced motion skips it';

export const viewport = { width: 1100, height: 960 };

/** The boxes a sighted reader sees: lane labels and cluster pills. */
async function labelBoxes(page, testid) {
  const nodes = await page.locator(
    `[data-testid="${testid}"] [data-timeline-part="label"], [data-testid="${testid}"] [data-timeline-part="cluster"]`,
  ).all();
  const boxes = [];
  for (const node of nodes) boxes.push({ box: await node.boundingBox(), text: await node.innerText() });
  return boxes.filter((entry) => entry.box);
}

function assertNoOverlap(boxes, where) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].box;
      const b = boxes[j].box;
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width
        && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.ok(
        !overlaps,
        `${where}: "${boxes[i].text}" and "${boxes[j].text}" overprint each other `
        + `(${JSON.stringify(a)} vs ${JSON.stringify(b)})`,
      );
    }
  }
}

/** Everything the entrance animates, once it should have finished. */
async function settled(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.rosh-tl-pop, .rosh-tl-fade, .rosh-tl-draw')) {
      const style = getComputedStyle(el);
      out.push({
        cls: el.getAttribute('data-timeline-part') ?? el.className.split(' ')[1] ?? '',
        opacity: style.opacity,
        transform: style.transform,
      });
    }
    return out;
  });
}

/** A finished draw rests at scaleX(1); reduced motion strips the transform
 *  entirely. Both are "not mid-animation", which is the claim. */
const IDENTITY = new Set(['none', 'matrix(1, 0, 0, 1, 0, 0)']);

export default async function check(page, { pageErrors, open }) {
  // ── 720px: the ordinary case ──────────────────────────────────────────────
  await open('?width=720');
  await page.locator('[data-testid="mould"] [data-timeline-part="fill"]').waitFor();

  assertNoOverlap(await labelBoxes(page, 'mould'), 'mould');
  assertNoOverlap(await labelBoxes(page, 'production'), 'production');

  // Every label is inside its own card. This is what proves the axis was built
  // against the MEASURED track rather than the 600px fallback the static
  // renders use: on a 720px card the fallback is wider than the track, and the
  // labels nearest the right edge would hang off it.
  for (const card of ['mould', 'production']) {
    const frame = await page.locator(`[data-testid="${card}"]`).boundingBox();
    for (const { box, text } of await labelBoxes(page, card)) {
      assert.ok(
        box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1,
        `${card}: "${text}" escapes the card (${JSON.stringify(box)} in ${JSON.stringify(frame)})`,
      );
    }
  }

  for (const card of ['mould', 'production']) {
    assert.equal(
      await page.locator(`[data-testid="${card}"] [aria-current="step"]`).count(), 1,
      `${card}: a tracker with no current step is a bug, and two is worse`,
    );
  }

  // The four DFM logs are one step reported four times.
  const pill = page.locator('[data-testid="mould"] [data-timeline-part="cluster"]');
  assert.equal(await pill.count(), 1);
  assert.match(await pill.innerText(), /DFM ×4/);
  // And they are still four dots on the rail at their own dates.
  assert.equal(
    await page.locator('[data-testid="mould"] [data-timeline-node="item"]').count(), 7,
    'the pill stands for the revisions without removing them',
  );

  // A phase bracket is a box with a border and no text, so "it rendered" is a
  // claim about geometry — and it shipped once as a `div` with no rule at all,
  // which has the right markup and no size.
  const bracket = await page.locator('[data-testid="mould"] .rosh-tl-phase').boundingBox();
  assert.ok(bracket && bracket.width > 8 && bracket.height > 4, `phase bracket: ${JSON.stringify(bracket)}`);
  assert.match(await page.locator('[data-timeline-part="phase"]').innerText(), /QA & Sample · parallel/);

  // The compressed tail says how much time it is not showing.
  assert.match(
    await page.locator('[data-testid="mould"] [data-timeline-part="break"]').innerText(),
    /282 days/,
  );

  // ── Motion: everything has landed by 700ms ────────────────────────────────
  await page.waitForTimeout(700);
  const marks = await settled(page);
  assert.ok(marks.length > 10, `expected the entrance to touch many marks, got ${marks.length}`);
  for (const mark of marks) {
    assert.equal(mark.opacity, '1', `${mark.cls} never reached full opacity`);
  }
  const fill = await page.locator('[data-testid="mould"] [data-timeline-part="fill"]')
    .evaluate((el) => getComputedStyle(el).transform);
  assert.ok(IDENTITY.has(fill), `the fill is still drawing at 700ms: ${fill}`);

  // ── Reduced motion: it has landed before it could animate ─────────────────
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open('?width=720');
  await page.locator('[data-testid="mould"] [data-timeline-part="fill"]').waitFor();
  // No wait: under reduced motion the card is finished the moment it paints.
  const immediate = await settled(page);
  for (const mark of immediate) {
    assert.equal(mark.opacity, '1', `${mark.cls} is animating under prefers-reduced-motion`);
  }
  const reducedFill = await page.locator('[data-testid="mould"] [data-timeline-part="fill"]')
    .evaluate((el) => getComputedStyle(el).transform);
  assert.ok(IDENTITY.has(reducedFill), `the fill animates under reduced motion: ${reducedFill}`);
  // The pulse RESTS invisible, so reduced motion has to hide it rather than
  // pin it at an opacity it never reaches while animating.
  assert.equal(
    await page.locator('.rosh-tl-pulse').first().evaluate((el) => getComputedStyle(el).opacity),
    '0',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ── 300px: the axis is abandoned, not squeezed ────────────────────────────
  await open('?width=300');
  await page.locator('[data-testid="mould"] [data-timeline-part="vertical"]').waitFor();
  assert.equal(await page.locator('[data-testid="mould"] [data-timeline-part="ruler"]').count(), 0);
  assert.equal(
    await page.locator('[data-testid="mould"] [aria-current="step"]').count(), 1,
    'the vertical variant is the same list, laid out differently',
  );
  assert.match(
    await page.locator('[data-testid="mould"]').innerText(),
    /days to today/,
    'and the idle stretch is stated in words, because a break glyph needs an axis',
  );
  assert.equal(
    await page.locator('[data-testid="production"] [data-timeline-part="vertical"]').count(), 1,
    'both cards cross the threshold, because both are the same track',
  );

  // ── Portraits, for the review ─────────────────────────────────────────────
  const dir = process.env.TIMELINE_SHOTS_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await open(`?width=720${theme === 'dark' ? '&theme=dark' : ''}`);
      await page.locator('[data-testid="mould"] [data-timeline-part="fill"]').waitFor();
      await page.waitForTimeout(800);
      for (const card of ['mould', 'production']) {
        await page.locator(`[data-testid="${card}"]`).screenshot({ path: join(dir, `${card}-${theme}.png`) });
      }
    }
    console.log(`  shots → ${dir}`);
  }

  assert.deepEqual(pageErrors, []);
}
