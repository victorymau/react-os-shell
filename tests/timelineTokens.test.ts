import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AA, composite, contrast, ratio, rgb, rgba } from './contrast';

/**
 * The timeline's colours, measured against the kit's own vocabulary.
 *
 * "The timeline's colors must be the ROS defaults, not hard-coded" and
 * "inspection must not be red" (Henry, 2026-09-14, watching the customer
 * portal). Both are claims about a stylesheet, and both were true of the file
 * that shipped before: `--tl-*` held five bespoke hues — an amber DFM, a violet
 * shipment, a teal test, a green completion, an ORANGE inspection — chosen for
 * an identity encoding rather than taken from the design system, and an
 * inspection is a routine QC report that the orange made read as a fault.
 *
 * So this spec does not pin hex strings, which would only prove the file was
 * not edited. It asserts the SHAPE of every `--tl-*` value (a reference, never
 * a literal), that the token each one points at exists, that none of them is in
 * a red / orange / amber / danger family by name OR by hue, and that what they
 * resolve to is still legible on the card in both themes.
 */

// The runner transpiles specs into node_modules/.cache, so import.meta.dirname
// is not tests/. REPO_ROOT is how the other CSS specs resolve the real tree.
const ROOT = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
const CSS = readFileSync(join(ROOT, 'src', 'ui.css'), 'utf-8');

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
const THEMES: [string, Map<string, string>][] = [['light', LIGHT], ['dark', DARK]];

/** The kinds a mark can be painted in, plus the three supporting roles. */
const KIND_TOKENS = ['--tl-dfm', '--tl-shipment', '--tl-testing', '--tl-completion', '--tl-inspection'];
const TL_TOKENS = [...KIND_TOKENS, '--tl-on-kind', '--tl-focus', '--tl-soft'];

/** A token name that promises the reader something is wrong. An inspection is
 *  not one of those, and neither is a drawing revision or a shipment. */
const ALARM = /(danger|warning|pending|critical|serious|error|red|orange|amber)/;

/** Follow a `var(--x)` chain to the literal behind it, in one theme. */
function resolveToken(name: string, theme: Map<string, string>, seen = new Set<string>()): string {
  assert.ok(!seen.has(name), `${name} resolves in a circle`);
  seen.add(name);
  const value = theme.get(name);
  assert.ok(value, `${name} is not declared`);
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value!);
  return ref ? resolveToken(ref[1], theme, seen) : value!;
}

/** The hue of a colour, 0–360, and how saturated it is — enough to tell a red
 *  from a blue without trusting the name somebody gave the token. */
function hsl(hex: string): { hue: number; sat: number } {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span === 0) return { hue: 0, sat: 0 };
  const hue = max === r
    ? (60 * ((g - b) / span) + 360) % 360
    : max === g ? 60 * ((b - r) / span) + 120 : 60 * ((r - g) / span) + 240;
  const light = (max + min) / 2;
  return { hue, sat: span / (1 - Math.abs(2 * light - 1)) };
}

// ── Shape: a reference, never a literal ─────────────────────────────────────

test('no --tl-* value anywhere in ui.css is a literal colour', () => {
  // The whole file, not just the two blocks below: a literal reintroduced in a
  // print block or a media query would be just as hard-coded and just as
  // invisible to a spec that only read `:root`.
  const literals = [...CSS.matchAll(/(--tl-[a-z-]+):\s*([^;]+);/g)]
    .filter((m) => !/^var\(--[a-z0-9-]+\)$/.test(m[2].trim()))
    .map((m) => `${m[1]}: ${m[2].trim()}`);
  assert.deepEqual(literals, [], `hard-coded timeline colours: ${literals.join(' | ')}`);
});

test('every --tl-* token points at a token the kit already declares', () => {
  for (const [name, theme] of THEMES) {
    for (const token of TL_TOKENS) {
      const value = theme.get(token);
      assert.ok(value, `${token} is not declared in ${name}`);
      const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value!);
      assert.ok(ref, `${token} is ${value} in ${name}, which is not a token reference`);
      assert.ok(
        theme.has(ref![1]),
        `${token} points at ${ref![1]}, which ui.css does not declare in ${name}`,
      );
    }
  }
});

// ── Henry's ruling: an inspection is not a fault ────────────────────────────

test('no timeline kind reads a red, orange, amber or danger token', () => {
  for (const [name, theme] of THEMES) {
    for (const token of TL_TOKENS) {
      const chain: string[] = [];
      let at: string | undefined = token;
      while (at) {
        chain.push(at);
        const ref = /^var\((--[a-z0-9-]+)\)$/.exec(theme.get(at) ?? '');
        at = ref ? ref[1] : undefined;
      }
      const alarming = chain.filter((step) => ALARM.test(step));
      assert.deepEqual(
        alarming, [],
        `${token} reaches ${alarming.join(', ')} in ${name} — Henry, 2026-09-14: an `
        + 'inspection must not be red, and neither is any other kind on this bar',
      );
    }
  }
});

test('and none of them is a warm hue by measurement either', () => {
  // The name is one half of the claim; a token called `--status-active-solid`
  // that somebody re-pointed at an orange is the other. 0–65° is red through
  // amber; a colour that desaturated has no hue worth the name.
  for (const [name, theme] of THEMES) {
    for (const token of KIND_TOKENS) {
      const { hue, sat } = hsl(resolveToken(token, theme));
      assert.ok(
        sat < 0.25 || hue > 65,
        `${token} is hue ${Math.round(hue)}° in ${name} — red through amber`,
      );
    }
  }
});

test('the accent kinds are one colour, so only the glyph tells them apart', () => {
  // dfm, shipment, testing and inspection are the same accent: the diamond, the
  // document, the flask are what carry the meaning now. A future edit that
  // gives one of them its own hue has re-created the identity encoding this
  // replaced, and should have to say so out loud.
  for (const [name, theme] of THEMES) {
    const accents = ['--tl-dfm', '--tl-shipment', '--tl-testing', '--tl-inspection']
      .map((token) => resolveToken(token, theme));
    assert.equal(new Set(accents).size, 1, `the accent kinds differ in ${name}: ${accents.join(', ')}`);
  }
});

test('a completion keeps the success role, because "it finished" is a status', () => {
  for (const [, theme] of THEMES) {
    assert.notEqual(
      resolveToken('--tl-completion', theme),
      resolveToken('--tl-dfm', theme),
      'a completion is the one mark whose colour still says something',
    );
  }
  assert.match(LIGHT.get('--tl-completion') ?? '', /--status-success-/);
  assert.match(DARK.get('--tl-completion') ?? '', /--status-success-/);
});

// ── Still legible once resolved ─────────────────────────────────────────────

test('every kind clears 3:1 on the card, and its ink clears AA on it', () => {
  // WCAG 1.4.11: a mark is a graphic, so 3:1 against the ground it stands on —
  // `--surface-sunken`, which is the timeline card's own. The glyph inside a
  // filled mark IS text-sized, so it takes the text bar.
  for (const [name, theme] of THEMES) {
    const ground = rgb(resolveToken('--surface-sunken', theme));
    const ink = rgb(resolveToken('--tl-on-kind', theme));
    for (const token of KIND_TOKENS) {
      const fill = rgb(resolveToken(token, theme));
      assert.ok(
        contrast(fill, ground) >= 3,
        `${token} is ${ratio(contrast(fill, ground))}:1 on the ${name} card, under 3:1`,
      );
      assert.ok(
        contrast(ink, fill) >= AA,
        `--tl-on-kind is ${ratio(contrast(ink, fill))}:1 on ${token} in ${name}`,
      );
    }
    const focus = rgb(resolveToken('--tl-focus', theme));
    assert.ok(
      contrast(focus, ground) >= 3,
      `--tl-focus is ${ratio(contrast(focus, ground))}:1 on the ${name} card`,
    );
  }
});

test('the soft wash stays a wash — transparent, so it holds in both themes', () => {
  for (const [name, theme] of THEMES) {
    const wash = resolveToken('--tl-soft', theme);
    const { channels, alpha } = rgba(wash);
    assert.ok(alpha > 0 && alpha < 1, `--tl-soft is opaque in ${name}: ${wash}`);
    // It sits behind a mark as a halo; what it must not do is swallow the card.
    const ground = rgb(resolveToken('--surface-sunken', theme));
    const over = composite(channels, alpha, ground);
    assert.ok(
      contrast(over, ground) < 3,
      `--tl-soft reads as a mark rather than a halo in ${name}`,
    );
  }
});
