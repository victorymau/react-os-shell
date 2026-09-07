import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import StatusBadge, {
  StatusBadgeProvider,
  GROUP_COLORS,
  GROUP_COLORS_SOLID,
  groupColors,
  type SemanticGroup,
} from '../src/shell/StatusBadge';

/**
 * One risk tier, two volumes.
 *
 * An operator console shows the same fact twice: quietly, once per row, in a
 * table of forty runs, and loudly in the header of the one run being read. With
 * a single palette a caller can only have one of those, so the second surface
 * hand-writes its colours — and that is exactly the drift `StatusBadge` exists
 * to prevent, arriving through the door marked "just this once".
 *
 * `emphasis` is the axis, spelled the way `Banner` already spells it: the kit
 * has one word for "how loud", not one per component.
 *
 * What must NOT move is the mapping. A status still resolves through the
 * provider to a group; emphasis picks the register that group is painted in.
 */

// The runner transpiles specs into node_modules/.cache, so import.meta.dirname
// is not tests/.
const ROOT = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const classOf = (markup: string) => /class="([^"]*)"/.exec(markup)?.[1] ?? '';
const badge = (status: string, props: Record<string, unknown> = {}) =>
  classOf(html(
    <StatusBadgeProvider groups={{ overdue: 'danger', paid: 'success' }}>
      <StatusBadge status={status} {...props} />
    </StatusBadgeProvider>,
  ));

const GROUPS = Object.keys(GROUP_COLORS) as SemanticGroup[];

test('emphasis is spelled the way Banner spells it', () => {
  // Not `variant`, not `loud`, not `size`. One vocabulary for one idea: a third
  // spelling is a thing every consumer has to learn and every reviewer has to
  // remember which component uses which.
  const banner = /export type BannerEmphasis = ([^;]+);/.exec(
    readFileSync(join(ROOT, 'src', 'shell', 'Banner.tsx'), 'utf-8'),
  )?.[1];
  assert.equal(banner, "'subtle' | 'solid'");
  const status = /export type StatusEmphasis = ([^;]+);/.exec(
    readFileSync(join(ROOT, 'src', 'shell', 'StatusBadge.tsx'), 'utf-8'),
  )?.[1];
  assert.equal(status, banner, 'the badge invented its own words for loud and quiet');
});

test('the default is the quiet register, and it is what existed before', () => {
  assert.equal(badge('overdue'), badge('overdue', { emphasis: 'subtle' }));
  for (const one of GROUP_COLORS.danger.split(' ')) assert.ok(badge('overdue').includes(one), one);
});

test('solid paints the same group in the loud register', () => {
  const loud = badge('overdue', { emphasis: 'solid' });
  for (const one of GROUP_COLORS_SOLID.danger.split(' ')) assert.ok(loud.includes(one), one);
  // And it is genuinely a different paint, not the same table under a new name.
  assert.notEqual(GROUP_COLORS.danger, GROUP_COLORS_SOLID.danger);
});

test('emphasis changes the volume and never the mapping', () => {
  // The one thing that must survive: which group a status belongs to is the
  // provider's answer, at either volume.
  for (const emphasis of ['subtle', 'solid'] as const) {
    const paid = badge('paid', { emphasis });
    const overdue = badge('overdue', { emphasis });
    for (const one of groupColors('success', emphasis).split(' ')) assert.ok(paid.includes(one));
    for (const one of groupColors('danger', emphasis).split(' ')) assert.ok(overdue.includes(one));
  }
  // An unmapped status is still neutral, at either volume.
  for (const one of groupColors('neutral', 'solid').split(' ')) {
    assert.ok(badge('who_knows', { emphasis: 'solid' }).includes(one), one);
  }
});

test('both registers cover every group', () => {
  // A group with an entry in one table and not the other is a badge that
  // renders unstyled the moment someone raises its volume.
  for (const group of GROUPS) {
    assert.ok(GROUP_COLORS[group], `${group} has no subtle paint`);
    assert.ok(GROUP_COLORS_SOLID[group], `${group} has no solid paint`);
    assert.equal(groupColors(group), GROUP_COLORS[group]);
    assert.equal(groupColors(group, 'solid'), GROUP_COLORS_SOLID[group]);
  }
});

test('the label override still comes from label and the colour still from status', () => {
  const markup = html(
    <StatusBadgeProvider groups={{ canceled: 'danger' }}>
      <StatusBadge status="canceled" label="Cancelled" emphasis="solid" />
    </StatusBadgeProvider>,
  );
  assert.match(markup, />Cancelled</);
  for (const one of GROUP_COLORS_SOLID.danger.split(' ')) assert.ok(classOf(markup).includes(one), one);
});
