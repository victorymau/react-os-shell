import assert from 'node:assert/strict';

export const describe =
  'every mark on the production scrubber takes its own hover, focus and click, and the bare rail still drags';

export const viewport = { width: 900, height: 560 };

/**
 * Henry, 2026-09-15 (translated from his Chinese ruling): "Hovering a production
 * report, an inspection or a shipment on the production bar has to show the same
 * small card the mould timeline already shows."
 *
 * It never did, and the reason was geometry rather than wiring: `ThumbLayer`
 * draws a full-width `.rosh-tl-hit` strip 24 px tall over the rail, AFTER the
 * list of marks and with no `z-index` of its own, so it won the paint order and
 * took every pointer event aimed at a dot. The popover, the `onClick`, the
 * `onOpen` and the hovered caption were all wired and all unreachable — on every
 * track with a thumb, which is every `ProductionTimeline`.
 *
 * Only a real engine can say whether a dot receives a pointer. jsdom has no
 * layout and no hit testing: `tests/productionTimeline.test.tsx` dispatches
 * `mouseover` straight at the button, which is why a green suite sat on top of
 * this for as long as the scrubber has existed. So the assertions here are made
 * with the mouse, at coordinates read off the page, plus one
 * `document.elementFromPoint` — the clearest statement of the bug there is.
 *
 * The other half is what must NOT change: pressing the bare rail between two
 * marks still starts a drag, and a drag that passes over a mark on its way is
 * not interrupted by it.
 */

const TRACK = '[data-testid="production"]';
const BUBBLE = '[data-timeline-part="tooltip"]';

/** Past the bubble's 160 ms dismissal grace, with room to spare. */
const GRACE_MS = 320;

const centreOf = async (locator) => {
  const box = await locator.boundingBox();
  assert.ok(box, 'the element has no box on the page');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** A real pointer arriving at an element's own centre. `locator.hover()` would
 *  do its own hit-target check and report an interception; this reports what the
 *  USER gets, which is the claim. */
async function pointTo(page, locator) {
  const centre = await centreOf(locator);
  await page.mouse.move(centre.x, centre.y);
  return centre;
}

async function moveAway(page) {
  await page.mouse.move(4, 4);
  await page.waitForTimeout(GRACE_MS);
}

/** What the browser says is on top at a point, as the nearest mark it belongs
 *  to — `elementFromPoint` lands on a glyph's `<svg>` inside a filled dot. */
const markAt = (page, { x, y }) => page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  if (!el) return null;
  const mark = el.closest('[data-timeline-node]');
  if (mark) return `mark ${mark.getAttribute('aria-label')}`;
  return `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}`;
}, [x, y]);

const logLines = async (page) =>
  (await page.locator('[data-testid="log"]').innerText()).split('\n').filter(Boolean);

export default async (page, { pageErrors }) => {
  const mark = (label) => page.locator(`${TRACK} [aria-label^="${label}"]`);
  const thumb = page.locator('[data-timeline-part="thumb"]');
  const bubble = page.locator(BUBBLE);
  await mark('PP#10140').waitFor();

  // ── The marks are on top of the strip, not under it ───────────────────────
  // One report, one inspection, one shipment: the three kinds a portal draws.
  // The report the thumb is parked on is deliberately not among them — the thumb
  // is 18 px and sits above everything, which is right, because it is the
  // control the reader has hold of.
  const KINDS = [
    ['a report', 'PP#10140', /CNC 40\/200/],
    ['an inspection', 'QC#4471', /8 of 8 passed/],
    ['a shipment', 'GI#8802', /40HQ to Port Botany/],
  ];

  for (const [kind, label] of KINDS) {
    const centre = await centreOf(mark(label));
    const top = await markAt(page, centre);
    assert.ok(
      (top ?? '').startsWith(`mark ${label}`),
      `${kind}: the element at ${label}'s own centre is ${top} — the scrubber's hit strip `
      + 'is over the mark again, so no hover, focus or click can reach it',
    );
  }

  // ── Hover opens the same popover the mould bar shows ───────────────────────
  for (const [kind, label, preview] of KINDS) {
    await pointTo(page, mark(label));
    await bubble.waitFor({ timeout: 3000 });
    const text = await bubble.innerText();
    assert.match(text, preview, `${kind}: the popover on ${label} carries someone else's preview`);
    assert.ok(text.includes(label), `${kind}: the popover does not name ${label}`);
    // The one label a scrubber draws follows the pointer, so a shipment and an
    // inspection are captioned while hovered even though the active mark is
    // always a report.
    const caption = (await page.locator(`${TRACK} [data-timeline-part="label"]`).innerText())
      .replace(/\n/g, ' ');
    assert.ok(
      caption.includes(label),
      `${kind}: the drawn caption still reads "${caption}" while ${label} is hovered`,
    );
    await moveAway(page);
    assert.equal(await bubble.count(), 0, `${kind}: the popover outlived the pointer`);
  }

  // ── And so does keyboard focus, which is the route that must never be lost ─
  await mark('GI#8802').evaluate((el) => el.focus());
  await bubble.waitFor({ timeout: 3000 });
  assert.match(await bubble.innerText(), /40HQ to Port Botany/, 'focus opens no popover');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(GRACE_MS);
  assert.equal(await bubble.count(), 0, 'Escape dismisses it (WCAG 1.4.13)');
  await mark('GI#8802').evaluate((el) => el.blur());
  await moveAway(page);

  // ── Two shipments a day apart are one mark until the pointer asks ─────────
  // Henry, 2026-09-15 (translated), on the customer's order SO#35456: "marks
  // that are too close overlap each other". Ten pixels apart on this window and
  // sixteen across, GI#8810 and GI#8811 were one dot over another — the second
  // unhoverable, unreadable and uncounted. They fold into one mark that says how
  // many, and the magnification the pointer asks for is what hands each of them
  // back its own dot and its own popover.
  const fold = page.locator(`${TRACK} [data-timeline-node="fold"]`);
  assert.equal(await fold.count(), 1, 'the two shipments are still drawn on top of each other');
  assert.equal(await fold.getAttribute('data-timeline-count'), '2');
  const foldName = await fold.getAttribute('aria-label');
  for (const label of ['GI#8810', 'GI#8811']) {
    assert.ok(foldName.includes(label), `the fold does not name ${label}: ${foldName}`);
    assert.equal(
      await page.locator(`${TRACK} [aria-label^="${label}"]`).count(), 0,
      `${label} is drawn under its neighbour again`,
    );
  }
  assert.equal(await page.locator(`${TRACK} .rosh-tl-count`).innerText(), '×2', 'the count is drawn');

  // The keyboard's route to what a fold stands for: focus lists the members in
  // the popover. It deliberately does NOT open the run — the button would
  // unmount under the focus it was just given.
  await fold.evaluate((el) => el.focus());
  await bubble.waitFor({ timeout: 3000 });
  const listed = await bubble.innerText();
  for (const label of ['GI#8810', 'GI#8811']) {
    assert.ok(listed.includes(label), `the fold's popover does not list ${label}: ${listed}`);
  }
  assert.equal(await fold.count(), 1, 'focus opened the run');
  await page.keyboard.press('Escape');
  await fold.evaluate((el) => el.blur());
  await moveAway(page);

  // The pointer arriving is what opens it: the axis magnifies and the run is
  // drawn as itself. Measured after the 240 ms the axis takes to open, because a
  // box read mid-tween is a box that has moved by the time it is used.
  await pointTo(page, fold);
  const members = ['GI#8810', 'GI#8811'].map((label) => page.locator(`${TRACK} [aria-label^="${label}"]`));
  await members[0].waitFor({ timeout: 3000 });
  await members[1].waitFor({ timeout: 3000 });
  await page.waitForTimeout(420);
  const spread = [await centreOf(members[0]), await centreOf(members[1])];
  assert.ok(
    spread[1].x - spread[0].x >= 16,
    `the opened run is ${spread[1].x - spread[0].x}px wide — still overlapping`,
  );
  // And each is hoverable on its own, which is the whole point of opening it.
  await page.mouse.move(spread[1].x, spread[1].y);
  await bubble.waitFor({ timeout: 3000 });
  assert.match(await bubble.innerText(), /1 x 40HQ to Fremantle/, "the second shipment's own popover");
  assert.deepEqual(await logLines(page), [], 'hovering a fold activated something');

  await moveAway(page);
  await page.waitForTimeout(700);
  assert.equal(await fold.count(), 1, 'the run never folded again once the pointer left');

  // ── Clicking a marker reaches the marker, and moves no thumb ───────────────
  // A marker is context rather than progress: the snapshot under the bar is not
  // its to change, so the press must not be read as a scrub either.
  const parked = await centreOf(thumb);
  const qc = await centreOf(mark('QC#4471'));
  await page.mouse.click(qc.x, qc.y);
  await page.waitForTimeout(120);
  assert.deepEqual(
    await logLines(page), ['click:qc-1'],
    'the click on the inspection mark went somewhere else',
  );
  const afterMarker = await centreOf(thumb);
  assert.ok(
    Math.abs(afterMarker.x - parked.x) < 1,
    `clicking an inspection dragged the thumb ${afterMarker.x - parked.x}px`,
  );
  await page.keyboard.press('Escape');
  await moveAway(page);

  // ── Clicking a report both selects it and snaps the thumb to it ────────────
  const first = await centreOf(mark('PP#10140'));
  await page.mouse.click(first.x, first.y);
  await page.waitForTimeout(240);
  assert.deepEqual(await logLines(page), ['click:qc-1', 'pick:r1'], 'the report was not picked');
  const onFirst = await centreOf(thumb);
  assert.ok(
    Math.abs(onFirst.x - first.x) < 2,
    `the thumb settled ${Math.abs(onFirst.x - first.x)}px from the report that was clicked`,
  );
  assert.match(await thumb.getAttribute('aria-valuetext'), /PP#10140 · /);
  await page.keyboard.press('Escape');
  await moveAway(page);

  // ── The bare rail still drags, and a mark in the way does not stop it ──────
  // Press at 35% of the axis — between the inspection at 20% and the second
  // report at 40% — and drag right, straight over the shipment diamond. Pointer
  // capture belongs to the strip for the length of the gesture, so crossing a
  // mark that now takes its own events must not hand the gesture away.
  const layer = await page.locator(`${TRACK} .rosh-tl-layer`).boundingBox();
  const strip = await page.locator(`${TRACK} [data-timeline-part="hit"]`).boundingBox();
  const railY = strip.y + strip.height / 2;
  await page.mouse.move(layer.x + layer.width * 0.35, railY);
  await page.mouse.down();
  await page.waitForTimeout(160);
  assert.match(
    await thumb.getAttribute('aria-valuetext'), /PP#10141 · /,
    'pressing the bare rail did not take the thumb to the nearest report',
  );
  await page.mouse.move(layer.x + layer.width * 0.62, railY, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  assert.match(
    await thumb.getAttribute('aria-valuetext'), /PP#10142 · /,
    'the drag was interrupted on its way over the shipment mark',
  );
  const last = await centreOf(mark('PP#10142'));
  const settled = await centreOf(thumb);
  assert.ok(
    Math.abs(settled.x - last.x) < 2,
    `the drag settled ${Math.abs(settled.x - last.x)}px from a report dot`,
  );
  // A drag is not a selection: nothing new was picked.
  assert.deepEqual(await logLines(page), ['click:qc-1', 'pick:r1'], 'a drag picked a report');

  assert.deepEqual(pageErrors.map((e) => e.message), [], 'the page threw');
};
