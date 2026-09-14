import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AA, composite, contrast, ratio, rgb } from './contrast';

/**
 * The timeline's colour, and the fact that there is only one of it.
 *
 * "The timeline's blue is not our theme blue; it must be the theme colour, and
 * pure flat blue — no skeuomorphic shading — consistent with everything else"
 * (Henry, 2026-09-14, translated from his Chinese ruling).
 *
 * Both halves are claims about files rather than about a screenshot, so both
 * are testable here. The COLOUR half: every `--tl-*` token and every blue
 * utility the two timeline components wear resolves to the theme accent at its
 * 600 step — the step the primary `Button` wears — with nothing reaching a
 * `--status-*` tier and nothing sitting on a 500. The FLAT half: no gradient
 * and no drop shadow survives anywhere in the `rosh-tl-*` block.
 *
 * What it deliberately does NOT do is pin hex strings, which would only prove
 * the file was not edited. It asserts the SHAPE of each value, the identity of
 * the values to each other, and that what they resolve to is still legible on
 * the card in both themes.
 */

// The runner transpiles specs into node_modules/.cache, so import.meta.dirname
// is not tests/. REPO_ROOT is how the other CSS specs resolve the real tree.
const ROOT = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf-8');
const CSS = read('src', 'ui.css');

/**
 * The accent chain every timeline fill is written as, and why it has three
 * links — see the docblock above `:root` in `src/ui.css`.
 *
 *   `--accent-600`     stamped inline by `useTheme` for a custom accent.
 *   `--color-blue-600` Tailwind v4's own variable, which is literally what
 *                      `.bg-blue-600` resolves to, so a mark and a primary
 *                      Button are ONE computed value rather than two that look
 *                      alike.
 *   `#2563eb`          the last resort, for a consumer shipping neither.
 */
const ACCENT_600 = 'var(--accent-600, var(--color-blue-600, #2563eb))';

/** What the chain actually renders as, per link, for the contrast measurements.
 *  Tailwind v4 states its palette in OKLCH: `oklch(54.6% 0.245 262.881)` is
 *  rgb(21 93 252), NOT the #2563eb that v3 spelled blue-600 — which is why the
 *  chain ends in a variable the utility shares rather than in that hex. */
const RENDERINGS: [string, [number, number, number]][] = [
  ['Tailwind v4 --color-blue-600', [21, 93, 252]],
  ['the #2563eb last resort', [37, 99, 235]],
];

/** The alpha `--tl-soft` mixes the accent down to. */
const SOFT_ALPHA = 0.16;

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/** Every declaration a selector makes anywhere in ui.css, later winning — the
 *  sheet declares `:root` half a dozen times (the ramp, the chart palette, the
 *  status tiers, these), and a token's value is the cascade of all of them. */
function merged(selector: string, into = new Map<string, string>()): Map<string, string> {
  const opener = `${selector} {`;
  for (let at = CSS.indexOf(opener); at !== -1; at = CSS.indexOf(opener, at + 1)) {
    const end = CSS.indexOf('\n}', at);
    if (end === -1) continue;
    for (const [name, value] of declarations(CSS.slice(at, end))) into.set(name, value);
  }
  return into;
}

const LIGHT = merged(':root');
const DARK = merged('[data-theme="dark"]', new Map(LIGHT));

/** The kinds a mark can be painted in, plus the three supporting roles. */
const KIND_TOKENS = ['--tl-dfm', '--tl-shipment', '--tl-testing', '--tl-completion', '--tl-inspection'];
const FILL_TOKENS = [...KIND_TOKENS, '--tl-focus'];
const TL_TOKENS = ['--tl-accent', ...FILL_TOKENS, '--tl-on-kind', '--tl-soft'];

/** Every `--tl-*` declaration in the file, wherever it was written. */
const ALL_TL = [...CSS.matchAll(/(--tl-[a-z-]+):\s*([^;]+);/g)]
  .map((m) => ({ name: m[1], value: m[2].trim(), at: m.index ?? 0 }));

// ── One accent step, everywhere ─────────────────────────────────────────────

test('the timeline has one colour, and it is the accent at its 600 step', () => {
  assert.equal(
    LIGHT.get('--tl-accent'), ACCENT_600,
    '--tl-accent is not the accent chain — Henry, 2026-09-14: the timeline\'s blue '
    + 'must be the theme blue, at the step the primary Button wears',
  );
  for (const token of FILL_TOKENS) {
    assert.equal(
      LIGHT.get(token), 'var(--tl-accent)',
      `${token} does not read --tl-accent, so the bar has more than one blue again`,
    );
  }
});

test('a completion is the accent too, because the check glyph is the meaning', () => {
  // It used to be the one kind that kept a hue (`--status-success-solid`). A
  // green tick on a bar of blue marks is a second vocabulary for a reader to
  // learn, and the tick already said it.
  assert.equal(LIGHT.get('--tl-completion'), LIGHT.get('--tl-dfm'));
});

test('the ink on a filled mark is the accent\'s own ink role', () => {
  assert.equal(LIGHT.get('--tl-on-kind'), 'var(--on-accent, #ffffff)');
});

test('the soft wash is the same accent, mixed down rather than a second colour', () => {
  assert.equal(LIGHT.get('--tl-soft'), 'color-mix(in srgb, var(--tl-accent) 16%, transparent)');
});

test('no --tl-* reaches a --status-* tier, in any theme or any block', () => {
  // The bar is not a status. `--status-active-solid` (#1d4ed8) is not remapped
  // by any accent theme, which is exactly how the timeline ended up wearing a
  // blue the rest of the product does not.
  const offenders = ALL_TL.filter((d) => d.value.includes('--status-'));
  assert.deepEqual(
    offenders.map((d) => `${d.name}: ${d.value}`), [],
    'a timeline colour is reading a status tier again',
  );
});

test('there is no dark step: the 600 fill is the same on a dark card', () => {
  // `.bg-blue-600` and `.border-blue-600` carry no dark remap — a primary
  // Button is the same fill on a dark page — so a bar that invented one would
  // stop matching it. `merged()` layers every `[data-theme="dark"]` block over
  // the light map, so an override anywhere in the file shows up as a difference.
  for (const token of TL_TOKENS) {
    assert.equal(
      DARK.get(token), LIGHT.get(token),
      `${token} is redeclared for dark; the accent step does not move`,
    );
  }
});

// ── Flat ────────────────────────────────────────────────────────────────────

/** Every rule in ui.css whose selector names a `rosh-tl-*` part, as
 *  `{ selector, body }` — the block the flatness claims are about. */
function timelineRules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  // Comments first: the docblocks in this file describe the rules they sit
  // above, and one of them now spells out the shadows that were removed.
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (selector.includes('rosh-tl-')) out.push({ selector, body: m[2] });
  }
  assert.ok(out.length > 40, `only ${out.length} rosh-tl rules found — the parser missed the block`);
  return out;
}

const TL_RULES = timelineRules();

test('nothing in the timeline is painted with a gradient', () => {
  const gradients = TL_RULES
    .filter((rule) => /-gradient\(/.test(rule.body))
    .map((rule) => rule.selector);
  assert.deepEqual(
    gradients, [],
    'the fill\'s white gloss is back, or something else grew one — Henry, '
    + '2026-09-14: pure flat, no skeuomorphic shading',
  );
});

test('every box-shadow left in the timeline is a flat ring, not a drop shadow', () => {
  // A ring is `0 0 0 Npx <colour>`: no offset, no blur, a solid band at a
  // radius. A drop shadow has a blur, an offset, or both. Keeping the rings is
  // the point — they are the halo in the card's own ground, the focus ring and
  // the accent wash, and all three are flat colour.
  /** Split a `box-shadow` value on its top-level commas — the ones between
   *  shadows, not the ones inside `rgba(...)` or `var(..., ...)`. */
  const shadows = (value: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
      current += ch;
    }
    out.push(current);
    return out.map((s) => s.trim()).filter(Boolean);
  };

  const drops: string[] = [];
  for (const rule of TL_RULES) {
    for (const declaration of rule.body.matchAll(/box-shadow:\s*([^;]+)/g)) {
      for (const shadow of shadows(declaration[1])) {
        if (shadow === 'none') continue;
        const lengths = [...shadow.matchAll(/(?:^|\s)(-?[\d.]+)(?:px|rem|em)?(?=\s|$)/g)]
          .map((m) => Number(m[1]));
        const [x = 0, y = 0, blur = 0] = lengths;
        if (x !== 0 || y !== 0 || blur !== 0) drops.push(`${rule.selector} → ${shadow}`);
      }
    }
  }
  assert.deepEqual(drops, [], 'a drop shadow is back in the timeline');
});

// ── The utilities the components wear ───────────────────────────────────────

const COMPONENTS = ['TimelineTrack.tsx', 'ProductionTimeline.tsx'];

test('neither timeline component wears a blue-500 utility any more', () => {
  for (const file of COMPONENTS) {
    const source = read('src', 'shell', file);
    const found = [...source.matchAll(/[\w:-]*blue-500\b/g)].map((m) => m[0]);
    assert.deepEqual(found, [], `${file} still paints with blue-500`);
  }
});

test('every blue utility in the two components is a 600', () => {
  // 600 is the accent step `themes.css` remaps under `[data-custom-accent]`
  // and the step the primary Button wears. A 700 or an 800 hover is a second
  // step, which is the thing this change removed.
  for (const file of COMPONENTS) {
    const source = read('src', 'shell', file);
    const steps = [...source.matchAll(/(?:bg|text|border)-blue-(\d+)/g)].map((m) => m[1]);
    assert.ok(steps.length > 0, `${file} paints with no blue utility at all`);
    assert.deepEqual(
      [...new Set(steps)], ['600'],
      `${file} mixes accent steps: ${[...new Set(steps)].join(', ')}`,
    );
  }
});

test('the accent hover steps follow a custom accent, so a hover cannot escape it', () => {
  // `.hover\:text-blue-600` and `.hover\:border-blue-600` are what the Play
  // pill wears. Without these two remaps a control whose resting state follows
  // the user's accent snaps back to literal blue under the pointer.
  const themes = read('src', 'themes.css');
  for (const rule of ['.hover\\:text-blue-600:hover', '.hover\\:border-blue-600:hover']) {
    assert.ok(
      themes.includes(`[data-custom-accent] ${rule}`),
      `themes.css does not remap ${rule} for a custom accent`,
    );
  }
});

// ── Still legible once resolved ─────────────────────────────────────────────

test('the accent clears 3:1 on both cards, and its ink clears AA on it', () => {
  // WCAG 1.4.11: a mark is a graphic, so 3:1 against the ground it stands on —
  // `--surface-sunken`, the timeline card's own. The glyph inside a filled mark
  // IS text-sized, so it takes the text bar.
  const ink = rgb('#ffffff');
  for (const [theme, tokens] of [['light', LIGHT], ['dark', DARK]] as const) {
    const ground = rgb(tokens.get('--surface-sunken')!);
    for (const [label, fill] of RENDERINGS) {
      assert.ok(
        contrast(fill, ground) >= 3,
        `${label} is ${ratio(contrast(fill, ground))}:1 on the ${theme} card, under 3:1`,
      );
      assert.ok(
        contrast(ink, fill) >= AA,
        `--tl-on-kind is ${ratio(contrast(ink, fill))}:1 on ${label}`,
      );
    }
  }
});

test('the soft wash stays a wash — it must not read as a mark of its own', () => {
  for (const [theme, tokens] of [['light', LIGHT], ['dark', DARK]] as const) {
    const ground = rgb(tokens.get('--surface-sunken')!);
    for (const [label, accent] of RENDERINGS) {
      const over = composite(accent, SOFT_ALPHA, ground);
      assert.ok(
        contrast(over, ground) < 3,
        `${label} at ${SOFT_ALPHA} reads as a mark rather than a halo in ${theme}`,
      );
    }
  }
});
