import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GROUP_COLORS, GROUP_COLORS_SOLID, type SemanticGroup } from '../src/shell/StatusBadge';
import { AA, composite, contrast, ratio, rgb, rgba } from './contrast';

/**
 * The status tokens, measured rather than eyeballed.
 *
 * A status used to be an opaque tint (`bg-green-100`) with a foreground picked
 * against ONE backdrop — the flat white surface. The soft tier replaces the
 * tint with a transparent wash so a badge composites over a raised panel and a
 * hovered row as well as over the plain surface, and that change moves the ink
 * decision: the colour behind the text is now three colours, and the darkest of
 * them is the one nobody looks at.
 *
 * The trap is measurable and it caught the obvious implementation. Reusing the
 * `-text` roles brand.css already publishes — they clear AA on the flat surface
 * and are RIGHT there — puts six of eight status inks under AA once a 16 % wash
 * of their own hue is between them and the surface. That is pinned below, so
 * that "simplifying" the soft ink back onto the `-text` roles fails the build
 * instead of shipping.
 *
 * These specs measure every pair on every backdrop it can actually land on, in
 * both themes. A palette spec that pins hex strings proves only that the file
 * was not edited.
 */

// The runner transpiles specs into node_modules/.cache, so import.meta.dirname
// is not tests/. REPO_ROOT is how the other CSS specs resolve the real tree.
const ROOT = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
const CSS = readFileSync(join(ROOT, 'src', 'ui.css'), 'utf-8');

/** ui.css declares `:root` and `[data-theme="dark"]` several times — the menu
 *  opacity, the neutral ramp, the chart palette, the status tokens. Name a
 *  property that identifies the block you mean, the way brandStylesheet does. */
function block(selector: string, marker: string): string {
  const opener = `${selector} {`;
  for (let at = CSS.indexOf(opener); at !== -1; at = CSS.indexOf(opener, at + 1)) {
    const end = CSS.indexOf('\n}', at);
    if (end === -1) continue;
    const body = CSS.slice(at, end);
    if (body.includes(marker)) return body;
  }
  assert.fail(`no ${selector} block declaring ${marker}`);
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const STATUS_LIGHT = declarations(block(':root', '--status-success-soft:'));
const STATUS_DARK = declarations(block('[data-theme="dark"]', '--status-success-soft-ink:'));
const RAMP_LIGHT = declarations(block(':root', '--surface: #ffffff'));
const RAMP_DARK = declarations(block('[data-theme="dark"]', '--surface: #1e1e2e'));

const GROUPS = Object.keys(GROUP_COLORS) as SemanticGroup[];

/** Every backdrop a badge can land on, per theme: the plain surface, a hovered
 *  row (`--surface-sunken`) and a raised panel. The wash sits on one of these
 *  three and its ink has to clear AA over the worst. */
const BACKDROPS = {
  light: ['--surface', '--surface-sunken', '--surface-raised'].map((r) => RAMP_LIGHT.get(r)!),
  dark: ['--surface', '--surface-sunken', '--surface-raised'].map((r) => RAMP_DARK.get(r)!),
} as const;

/** A token value, following one level of `var(--…)` into the theme's ramp. */
function value(token: string, theme: 'light' | 'dark'): string {
  const table = theme === 'light' ? STATUS_LIGHT : STATUS_DARK;
  const raw = table.get(token) ?? STATUS_LIGHT.get(token);
  assert.ok(raw, `${token} is not declared`);
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  if (!ref) return raw;
  const ramp = theme === 'light' ? RAMP_LIGHT : RAMP_DARK;
  const resolved = ramp.get(ref[1]);
  assert.ok(resolved, `${token} reads ${ref[1]}, which the ${theme} ramp does not declare`);
  return resolved;
}

/** Worst contrast of an ink over `wash` composited on each backdrop. */
function worst(ink: string, wash: string, theme: 'light' | 'dark'): number {
  const { channels, alpha } = rgba(wash);
  return Math.min(
    ...BACKDROPS[theme].map((b) => contrast(rgb(ink), composite(channels, alpha, rgb(b)))),
  );
}

test('the soft tier is declared for every group the badge can render', () => {
  // The table in StatusBadge.tsx and the tokens in ui.css are two halves of one
  // decision, and `var(--typo)` renders as an unstyled pill rather than an
  // error. Walk the class strings the component actually emits.
  for (const group of GROUPS) {
    for (const table of [GROUP_COLORS, GROUP_COLORS_SOLID]) {
      const tokens = [...table[group].matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
      assert.equal(tokens.length, 2, `${group}: expected a fill and an ink`);
      for (const token of tokens) {
        assert.ok(STATUS_LIGHT.has(token), `${group} reads ${token}, which ui.css does not declare`);
      }
    }
    assert.ok(STATUS_DARK.has(`--status-${group}-soft-ink`), `${group} has no dark ink`);
  }
});

test('the soft fill is a wash, and the same wash in both themes', () => {
  for (const group of GROUPS) {
    const wash = value(`--status-${group}-soft`, 'light');
    const { alpha } = rgba(wash);
    // Transparency is the whole tier: an opaque tint is calibrated against one
    // backdrop and reads as a patch on the other two.
    assert.ok(alpha > 0 && alpha < 1, `${group}: --status-${group}-soft is not transparent (${wash})`);
    // And a transparent wash has no theme — the surface under it does. A dark
    // re-declaration would be a second value to keep in step for no gain.
    assert.equal(
      STATUS_DARK.has(`--status-${group}-soft`),
      false,
      `${group}: the wash is re-declared for dark; only the ink moves`,
    );
  }
});

test('every soft ink clears AA over its own wash, on every surface it can land on', () => {
  const measured: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const group of GROUPS) {
      const r = ratio(worst(value(`--status-${group}-soft-ink`, theme), value(`--status-${group}-soft`, theme), theme));
      measured.push(`${theme} ${group} ${r}`);
      assert.ok(r >= AA, `${theme} ${group}: worst backdrop measures ${r}:1, under AA (${AA})`);
    }
  }
  assert.equal(measured.length, GROUPS.length * 2);
});

test('white clears AA on every solid fill', () => {
  const ink = value('--status-on-solid', 'light');
  for (const group of GROUPS) {
    const r = ratio(contrast(rgb(ink), rgb(value(`--status-${group}-solid`, 'light'))));
    assert.ok(r >= AA, `${group}: ${r}:1 on the solid fill, under AA`);
  }
});

test("the brand `-text` roles are why the soft tier carries its own ink", () => {
  // The trap, pinned. These four clear AA on the FLAT surface — brand.css says
  // so and measures it — which is exactly what makes reaching for them here so
  // tempting. Over a wash of their own hue they do not, and this fails the
  // moment someone folds the soft ink back onto them.
  const brand = readFileSync(join(ROOT, 'src', 'brand.css'), 'utf-8');
  const textRole = (name: string, theme: 'light' | 'dark') => {
    const scope = theme === 'light' ? /:root \{([\s\S]*?)\n\}/ : /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/;
    const body = scope.exec(brand)?.[1] ?? '';
    return declarations(body).get(name)!;
  };
  const pairs: Array<[string, SemanticGroup]> = [
    ['--success-text', 'success'],
    ['--warning-text', 'warning'],
    ['--danger-text', 'danger'],
  ];
  for (const theme of ['light', 'dark'] as const) {
    for (const [role, group] of pairs) {
      const ink = textRole(role, theme);
      assert.ok(ink, `${role} is missing from brand.css`);
      const naive = ratio(worst(ink, value(`--status-${group}-soft`, theme), theme));
      const shipped = ratio(worst(value(`--status-${group}-soft-ink`, theme), value(`--status-${group}-soft`, theme), theme));
      assert.ok(
        shipped > naive,
        `${theme} ${group}: the shipped ink (${shipped}:1) is no better than ${role} (${naive}:1) — ` +
          'the recalibration has been undone',
      );
    }
  }
  // Not merely worse: actually under the bar. Light success/warning/danger and
  // dark success/danger all fail, which is the finding this tier exists for.
  assert.ok(ratio(worst(textRole('--success-text', 'light'), value('--status-success-soft', 'light'), 'light')) < AA);
  assert.ok(ratio(worst(textRole('--danger-text', 'light'), value('--status-danger-soft', 'light'), 'light')) < AA);
  assert.ok(ratio(worst(textRole('--success-text', 'dark'), value('--status-success-soft', 'dark'), 'dark')) < AA);
});
