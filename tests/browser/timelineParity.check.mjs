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
  // The fixture pins the mould card's `endDate` to 2026-09-11 and the check
  // below reads that as "endDate IS today" — which was true on the day it was
  // written and false two days later, when the track (correctly) stopped
  // drawing a Today mark on a window that had ended. Freeze the page's clock
  // on that date so the check keeps meaning what it says. `setFixedTime` fixes
  // only `Date`; timers and animation frames stay real, which the motion
  // assertions further down depend on.
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'));

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
  // And they are still on the rail at their own dates — the two that have a date
  // to themselves as their own dots, and the three that share 7 November as one
  // fold, because three dots on one coordinate is one dot and two nobody can
  // see. (This asserted seven separate dots until 2026-09-15, which is exactly
  // the overlap Henry reported.)
  assert.equal(
    await page.locator('[data-testid="mould"] [data-timeline-node="item"]').count(), 4,
    'the pill stands for the revisions without removing them',
  );
  const sameDay = page.locator('[data-testid="mould"] [data-timeline-node="fold"]');
  assert.equal(await sameDay.count(), 1, 'the three milestones on 7 November are one fold');
  assert.equal(await sameDay.getAttribute('data-timeline-count'), '3');
  for (const label of ['DFM v3', 'DFM v4', 'DFM Confirmed']) {
    assert.ok(
      (await sameDay.getAttribute('aria-label')).includes(label),
      `the fold does not name ${label}`,
    );
  }

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

  // ── The chrome both cards wear ────────────────────────────────────────────
  // One header shape, sentence case, the reference as the subject. The row this
  // replaced was 12px tracked capitals on one card and 13px sentence case on
  // the other, which a reader with both open reads as two features.
  for (const [card, heading, subject] of [
    ['mould', 'Mould development', '001F/1813'],
    ['production', 'Production progress', 'SO#35489'],
  ]) {
    const title = page.locator(`[data-testid="${card}"] .rosh-tl-title`);
    assert.equal(await title.innerText(), heading);
    assert.equal(
      await title.evaluate((el) => getComputedStyle(el).textTransform), 'none',
      `${card}: the heading is still being shouted`,
    );
    assert.match(await page.locator(`[data-testid="${card}"] .rosh-tl-meta`).innerText(), new RegExp(subject));
  }
  // The rail is the prototype's 6px, and it is the only number the bands are
  // derived from — a stale 8 shows up as every offset being 1px out.
  const rail = await page.locator('[data-testid="mould"] .rosh-tl-rail').boundingBox();
  assert.ok(Math.abs(rail.height - 6) < 0.5, `rail height ${rail.height}`);

  // The play control is a pill on the RIGHT of the header, not an icon to the
  // left of the title, and its glyph follows its state.
  const play = page.locator('[data-testid="production"] .rosh-tl-play');
  assert.equal(await play.innerText(), 'Play');
  const head = await page.locator('[data-testid="production"] .rosh-tl-head').boundingBox();
  const playBox = await play.boundingBox();
  assert.ok(
    playBox.x > head.x + head.width / 2,
    `the play control is not in the header's right slot: ${JSON.stringify(playBox)}`,
  );
  await play.click();
  assert.equal(await play.innerText(), 'Pause');
  assert.equal(await play.getAttribute('aria-pressed'), 'true');

  // ── Playback: the thumb TRAVELS between two reports ───────────────────────
  // jsdom can only be told what a frame is; this is the claim under a real
  // clock and a real compositor — that consecutive animation frames each find
  // the thumb further along the rail than the last one, and that nothing under
  // the bar changes until it gets somewhere. What it replaced stepped from
  // report to report on a timer, and a step is indistinguishable from a stall
  // followed by a jump.
  const thumbLeft = () => page.locator('[data-timeline-part="thumb"]')
    .evaluate((el) => parseFloat(el.style.left));
  const reportLeft = (label) => page.locator(`[data-testid="production"] [aria-label^="${label}"]`)
    .evaluate((el) => parseFloat(el.style.left));
  const firstReport = await reportLeft('PP#10140');
  const secondReport = await reportLeft('PP#10141');
  assert.ok(
    Math.abs((await thumbLeft()) - firstReport) < 1,
    'Play did not rewind to the first report',
  );
  // It rests on the report it is leaving before it sets off, so wait for the
  // travel rather than for a duration.
  await page.waitForFunction(
    (x0) => parseFloat(document.querySelector('[data-timeline-part="thumb"]').style.left) > x0 + 0.5,
    firstReport,
    { timeout: 4000 },
  );
  // Six consecutive frames, sampled from the thumb's OWN writes rather than from
  // a second animation-frame loop polling for them. Two rAF loops racing each
  // other report the order their callbacks happened to be registered in: when the
  // poller's callback runs a millisecond before the one that moves the thumb — and
  // whether it does depends on which frame a `waitForFunction` resolved on — it
  // reads the previous frame's style and calls a travelling thumb stalled, about a
  // third of the time. A mutation of the style attribute IS the frame that moved
  // it, so there is nothing left to race.
  const glide = await page.evaluate(async (count) => {
    const thumb = document.querySelector('[data-timeline-part="thumb"]');
    const status = document.querySelector('[data-testid="production"] .rosh-tl-status');
    const chip = document.querySelector('[data-timeline-part="chip"]');
    const fill = document.querySelector('[data-testid="production"] [data-timeline-part="fill"]');
    const samples = [];
    await new Promise((resolve) => {
      const stop = () => { observer.disconnect(); resolve(); };
      const observer = new MutationObserver(() => {
        samples.push({
          left: parseFloat(thumb.style.left),
          painted: thumb.getBoundingClientRect().x,
          fill: fill.getBoundingClientRect().width,
          chip: chip.innerText.trim(),
          status: status.innerText.trim(),
        });
        if (samples.length >= count) stop();
      });
      observer.observe(thumb, { attributes: true, attributeFilter: ['style'] });
      // A thumb that has stopped moving writes nothing, and a promise nobody
      // resolves is a check that hangs instead of failing.
      setTimeout(stop, 4000);
    });
    return samples;
  }, 6);
  assert.equal(glide.length, 6, `the thumb moved ${glide.length} times in four seconds of gliding`);
  for (let i = 1; i < glide.length; i++) {
    assert.ok(
      glide[i].left > glide[i - 1].left,
      `frame ${i} of the glide did not advance: ${glide.map((s) => s.left).join(' → ')}`,
    );
  }
  assert.ok(
    glide.at(-1).painted > glide[0].painted,
    'the disc moved in its style and not on the screen',
  );
  for (const sample of glide) {
    assert.ok(
      sample.left > firstReport && sample.left < secondReport,
      `the thumb was at ${sample.left}, outside the stretch it is crossing`,
    );
    // The rail fill follows the thumb, and the line under the bar does not
    // change until the thumb has arrived somewhere.
    assert.ok(Math.abs(sample.fill - sample.left) < 2, `the fill lagged the thumb: ${sample.fill} vs ${sample.left}`);
    assert.equal(sample.status, glide[0].status, 'the status line ticked over mid-glide');
  }
  assert.match(glide[0].status, /Showing PP#10140/);
  // The chip counts days as the thumb crosses them, rather than repeating the
  // date of the report it left.
  assert.ok(new Set(glide.map((s) => s.chip)).size >= 1);
  assert.ok(glide.every((s) => /\d/.test(s.chip)), `the chip stopped saying a date: ${glide[0].chip}`);

  // Pause freezes it where it is — which is nowhere a report sits.
  await play.click();
  assert.equal(await play.innerText(), 'Play');
  const frozen = await thumbLeft();
  await page.waitForTimeout(400);
  assert.equal(await thumbLeft(), frozen, 'a pause settled the thumb instead of freezing it');
  assert.ok(
    frozen > firstReport && frozen < secondReport,
    `a pause snapped the thumb to ${frozen} rather than leaving it mid-glide`,
  );

  // The footer: a status line, and legend chips drawn with the track's glyphs.
  const foot = page.locator('[data-testid="production"] .rosh-tl-foot');
  assert.match(await foot.innerText(), /Showing PP#\d+ · /);
  assert.doesNotMatch(await foot.innerText(), /Estimated/, 'the thumb only rests on reports');
  assert.equal(await page.locator('[data-testid="production"] .rosh-tl-legend > span').count(), 3);
  // The edge caption is inside the stage now, over the coordinate it names,
  // rather than flanking a bar whose left edge it could only point at.
  assert.equal(await page.locator('[data-testid="production"] .rosh-tl-edge').count(), 1);

  // Today is at the right edge of the mould card, because `endDate` IS today —
  // which is exactly the case a strict "inside the window" test dropped.
  assert.equal(await page.locator('[data-testid="mould"] [data-timeline-part="today"]').count(), 1);

  // ── The thumb only ever rests on a report ─────────────────────────────────
  const thumb = page.locator('[data-timeline-part="thumb"]');
  const thumbBox = await thumb.boundingBox();
  const track = await page.locator('[data-testid="production"] .rosh-tl-layer').boundingBox();
  // Drag to a point deliberately BETWEEN two reports and let go.
  await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.42, thumbBox.y + thumbBox.height / 2, { steps: 12 });
  await page.mouse.up();
  // Past the 460ms snap-highlight, so a dot the drag crossed is back at its own
  // size and its box still reports its own centre.
  await page.waitForTimeout(600);
  const resting = await thumb.boundingBox();
  const centres = await page.locator('[data-testid="production"] [data-timeline-node="item"]')
    .evaluateAll((nodes) => nodes.map((el) => {
      const box = el.getBoundingClientRect();
      return box.x + box.width / 2;
    }));
  const nearest = centres
    .map((x) => Math.abs(x - (resting.x + resting.width / 2)))
    .sort((a, b) => a - b)[0];
  assert.ok(nearest < 6, `the thumb settled ${nearest}px from any report dot`);
  assert.match(await thumb.getAttribute('aria-valuetext'), /PP#\d+ · /);

  // ── Zoom: the pill opens its own stretch ──────────────────────────────────
  const memberX = () => page.locator('[data-testid="mould"] [data-timeline-node="item"]')
    .evaluateAll((nodes) => nodes
      .filter((el) => (el.getAttribute('aria-label') ?? '').startsWith('DFM v'))
      .map((el) => el.getBoundingClientRect().x));
  const tight = await memberX();
  await page.locator('[data-testid="mould"] [data-timeline-part="cluster"]').hover();
  await page.waitForTimeout(320);
  const spread = await memberX();
  assert.ok(
    Math.max(...spread) - Math.min(...spread) > Math.max(...tight) - Math.min(...tight) + 10,
    `the cluster did not magnify: ${JSON.stringify(tight)} → ${JSON.stringify(spread)}`,
  );
  await page.mouse.move(4, 4);
  await page.waitForTimeout(320);

  // ── Preview: the popover survives the trip from the dot into it ───────────
  // Through the FOLD, because DFM Confirmed shares 7 November with two drawings:
  // three dots on one coordinate are one dot, and no magnification separates a
  // coordinate from itself — so the fold's popover is where those three live,
  // each with the card it would have shown on its own.
  const sameDayFold = page.locator('[data-testid="mould"] [data-timeline-node="fold"]');
  await sameDayFold.hover();
  const bubble = page.locator('[data-timeline-part="tooltip"]');
  await bubble.waitFor();
  assert.match(await bubble.innerText(), /DFM Confirmed/);
  assert.match(await bubble.innerText(), /3D model approved/);
  const bubbleBox = await bubble.boundingBox();
  await page.mouse.move(bubbleBox.x + bubbleBox.width / 2, bubbleBox.y + bubbleBox.height / 2, { steps: 8 });
  await page.waitForTimeout(220);
  assert.equal(await bubble.count(), 1, 'the popover closed on the way into it (WCAG 1.4.13)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  assert.equal(await page.locator('[data-timeline-part="tooltip"]').count(), 0, 'Escape dismisses it');

  // ── Motion: everything has landed by 700ms ────────────────────────────────
  await open('?width=720');
  await page.locator('[data-testid="mould"] [data-timeline-part="fill"]').waitFor();
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
  // Playback still walks the reports; what goes is the travel between them. The
  // jsdom spec asserts this against a stubbed media query — this is the one
  // that proves the component asks the real one.
  const stepped = page.locator('[data-testid="production"] .rosh-tl-play');
  await stepped.click();
  const stops = await page.locator('[data-testid="production"] [data-timeline-node="item"]')
    .evaluateAll((nodes) => nodes.map((el) => parseFloat(el.style.left)));
  // A frame count rather than a deadline: a loop bounded by the clock is a
  // loop that never ends if the clock is the thing that is wrong.
  const walked = await page.evaluate(async (count) => {
    const thumb = document.querySelector('[data-timeline-part="thumb"]');
    const seen = [];
    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => { requestAnimationFrame(resolve); });
      seen.push(parseFloat(thumb.style.left));
    }
    return [...new Set(seen)];
  }, 110);
  for (const x of walked) {
    assert.ok(
      stops.some((stop) => Math.abs(stop - x) < 0.5),
      `under reduced motion the thumb was at ${x}, between two reports (stops: ${stops.join(', ')})`,
    );
  }
  assert.ok(walked.length > 1, 'the stepped walk never moved at all');
  await stepped.click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ── The clock, not the frame rate ─────────────────────────────────────────
  // The incident this answers. In the customer portal's embedded pane, idle, the
  // thumb sat on its first report for EIGHT SECONDS and set off when frames
  // resumed (2026-09-14: `.rosh-tl-thumb` style.left sampled every 50ms held at
  // 8.8px from 0ms through 8,031ms; an earlier run froze for forty seconds).
  // Frames were sparse and the playback clock was made of them, so a 700ms rest
  // cost seven frames whatever the clock said.
  //
  // A throttled surface, reproduced: ONE frame every 500ms. The rest is waited
  // out on a timer, so it is over at 700ms whatever the frames are doing; the
  // leg then takes a frame to anchor and a frame to cross, which puts the
  // arrival near 1,500ms. Paced by frames instead, the rest alone is seven of
  // them and the leg five: twelve frames, six seconds, and at 3,000ms the thumb
  // has not left the first report. This is the one assertion in the suite that a
  // real clock can make and jsdom cannot.
  await open('?width=720');
  await page.locator('[data-testid="production"] [data-timeline-part="fill"]').waitFor();
  const sparseFirst = await reportLeft('PP#10140');
  const sparseSecond = await reportLeft('PP#10141');
  // 350ms per 100px of rail, floored at 450ms — the schedule's own arithmetic,
  // restated here so the wait is read off the fixture rather than guessed.
  const legMs = Math.min(Math.max(((sparseSecond - sparseFirst) * 350) / 100, 450), 1400);
  const sparseFrameMs = 500;
  const sparseWaitMs = 3000;
  assert.ok(
    700 + legMs + 2 * sparseFrameMs < sparseWaitMs,
    `the fixture's first leg is ${legMs}ms, too long for a ${sparseWaitMs}ms wait`,
  );
  await page.evaluate((gap) => {
    window.__realFrames = {
      request: window.requestAnimationFrame.bind(window),
      cancel: window.cancelAnimationFrame.bind(window),
    };
    window.requestAnimationFrame = (cb) => window.setTimeout(() => { cb(performance.now()); }, gap);
    window.cancelAnimationFrame = (id) => { window.clearTimeout(id); };
  }, sparseFrameMs);
  // A direct DOM click: Playwright's own actionability check waits on animation
  // frames, and those are the thing being starved.
  await page.locator('[data-testid="production"] .rosh-tl-play').evaluate((el) => { el.click(); });
  await page.waitForTimeout(sparseWaitMs);
  const sparseAt = await thumbLeft();
  await page.evaluate(() => {
    window.requestAnimationFrame = window.__realFrames.request;
    window.cancelAnimationFrame = window.__realFrames.cancel;
  });
  assert.ok(
    sparseAt >= sparseSecond - 1,
    `${sparseWaitMs}ms at one frame every ${sparseFrameMs}ms left the thumb at ${sparseAt}, `
      + `short of the second report at ${sparseSecond}`,
  );
  // The second report or a later one — three seconds is enough for the run to
  // have rested on PP#10141 and set off again, and which of the two it is on is
  // not the claim. The claim is that it is no longer on the first.
  assert.match(
    await page.locator('[data-testid="production"] .rosh-tl-status').innerText(),
    /Showing PP#1014[1-5]/,
    'the thumb got there without the card being told it had',
  );

  // ── The palette, and the start anchor, in a browser that resolves them ────
  //
  // "The timeline's colors must be the ROS defaults, not hard-coded" and
  // "inspection must not be red" (Henry, 2026-09-14), and then, the same day:
  // "the timeline's blue is not our theme blue; it must be the theme colour".
  // The tier the kinds used to read — `--status-active-*` — was neither
  // hard-coded nor red, and was still the wrong blue, because no accent theme
  // remaps it. They read `--tl-accent` now, which is the theme's own 600 step.
  // jsdom computes no custom property, so the suite's static specs can only
  // read the stylesheet; here the chip has a colour.
  for (const theme of ['light', 'dark']) {
    await open(`?width=720${theme === 'dark' ? '&theme=dark' : ''}`);
    await page.locator('[data-testid="production"] [data-timeline-part="fill"]').waitFor();

    // The token the kinds are supposed to read, resolved by the browser through
    // a probe rather than restated here as a hex the spec could drift from.
    const seen = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--tl-accent)';
      document.body.appendChild(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      const chip = (which) => document.querySelector(
        `[data-testid="production"] .rosh-tl-legend .rosh-tl-glyph.${which}`,
      );
      const diamond = chip('is-diamond');
      const disc = chip('is-disc');
      return {
        accent,
        shipment: getComputedStyle(diamond).backgroundColor,
        inspection: getComputedStyle(disc).backgroundColor,
      };
    });

    assert.equal(seen.inspection, seen.accent,
      `${theme}: the inspection chip is ${seen.inspection}, not the theme accent (${seen.accent})`);
    assert.equal(seen.shipment, seen.accent, `${theme}: the shipment chip drifted from the accent`);
    // And measured, not merely named: nothing on this bar is a red, an orange
    // or an amber. 0-65 degrees of hue is that whole range.
    const [r, g, b] = seen.inspection.match(/[\d.]+/g).slice(0, 3).map(Number);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const hue = max === min ? 0 : max === r
      ? (60 * ((g - b) / (max - min)) + 360) % 360
      : max === g ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
    assert.ok(max - min < 24 || hue > 65,
      `${theme}: the inspection chip is hue ${Math.round(hue)} — red through amber`);

    // The start anchor, on both cards: a caption the reader can see, over a
    // ring standing on the axis origin.
    for (const card of ['mould', 'production']) {
      const caption = page.locator(`[data-testid="${card}"] [data-timeline-part="start-caption"]`);
      await caption.waitFor({ state: 'visible' });
      assert.match(await caption.innerText(), /^Start · \d{2}\/\d{2}\/\d{4}$/,
        `${theme}/${card}: the start caption does not name the day the window opens`);
      const capBox = await caption.boundingBox();
      const ringBox = await page.locator(`[data-testid="${card}"] .rosh-tl-start`).boundingBox();
      const layer = await page.locator(`[data-testid="${card}"] .rosh-tl-layer`).boundingBox();
      const rail = await page.locator(`[data-testid="${card}"] .rosh-tl-rail`).boundingBox();
      assert.ok(Math.abs(ringBox.x + ringBox.width / 2 - layer.x) < 1.5,
        `${theme}/${card}: the ring is ${ringBox.x - layer.x}px off the axis origin`);
      assert.ok(capBox.y + capBox.height <= rail.y + 1,
        `${theme}/${card}: the caption sits on the rail rather than above it`);
      // And it shares no pixel with a label — the packer was told about it.
      assertNoOverlap([...await labelBoxes(page, card), { box: capBox, text: 'start caption' }], card);
    }
  }
  // The mould card opens ON its first milestone, so the ring encircles it
  // instead of hiding under it; the production card's window opens days before
  // its first report, so there the ring closes back up.
  await open('?width=720');
  await page.locator('[data-testid="mould"] [data-timeline-part="fill"]').waitFor();
  assert.equal(await page.locator('[data-testid="mould"] .rosh-tl-start.is-around').count(), 1);
  assert.equal(await page.locator('[data-testid="production"] .rosh-tl-start.is-around').count(), 0);
  const around = await page.locator('[data-testid="mould"] .rosh-tl-start').boundingBox();
  const opener = await page.locator('[data-testid="mould"] [aria-label^="Project Initiated"]').boundingBox();
  assert.ok(around.width > opener.width + 6,
    `the ring (${around.width}px) does not clear the milestone it encircles (${opener.width}px)`);

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
    // And the variant nobody looks at until it is wrong.
    await open('?width=300');
    await page.locator('[data-testid="mould"] [data-timeline-part="vertical"]').waitFor();
    await page.waitForTimeout(800);
    for (const card of ['mould', 'production']) {
      await page.locator(`[data-testid="${card}"]`).screenshot({ path: join(dir, `${card}-narrow.png`) });
    }
    console.log(`  shots → ${dir}`);
  }

  assert.deepEqual(pageErrors, []);
}
