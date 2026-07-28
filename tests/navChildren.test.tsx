import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleChildren, isReachable, type NavItem } from '../src/shell/nav-types';

/**
 * Regression guard for the 3rd-level start-menu flyout that never opened.
 *
 * <StartMenu> drew the chevron from the RAW `item.children` but rendered the
 * flyout from `children.filter(perms)`. A user who could see the parent row
 * but none of its children — e.g. admin-portal HR → "Recruitment", whose
 * parent carries no `perms` of its own while every child needs a recruitment
 * permission — got an arrow that highlighted on hover and opened nothing.
 *
 * Both affordances now come off `visibleChildren`, so the invariant to hold is:
 * the chevron/flyout list and the reachability test agree, always.
 */

const allow = (granted: string[]) => (perms: string[]) => perms.some(p => granted.includes(p));
const ALL = () => true;
const NONE = () => false;

const RECRUITMENT: NavItem = {
  // Synthetic key — toggles the sub-flyout, never navigates.
  to: '/recruitment',
  label: 'Recruitment',
  children: [
    { to: '/recruitment/jobs', label: 'Job Postings', perms: ['view_jobposting'] },
    { to: '/recruitment/candidates', label: 'Candidates', perms: ['view_candidate'] },
    { to: '/recruitment/offers', label: 'Offers', perms: ['view_offer'] },
  ],
};

test('a group with no visible children is not reachable — no arrow, no dead row', () => {
  // The exact reported bug: parent visible (it has no perms of its own), every
  // child gated behind a permission the user lacks.
  assert.deepEqual(visibleChildren(RECRUITMENT, NONE), []);
  assert.equal(isReachable(RECRUITMENT, NONE), false);
});

test('one granted child is enough to make the group reachable', () => {
  const kids = visibleChildren(RECRUITMENT, allow(['view_candidate']));
  assert.deepEqual(kids.map(k => k.label), ['Candidates']);
  assert.equal(isReachable(RECRUITMENT, allow(['view_candidate'])), true);
});

test('a fully-permitted user sees every child', () => {
  assert.equal(visibleChildren(RECRUITMENT, ALL).length, 3);
  assert.equal(isReachable(RECRUITMENT, ALL), true);
});

test('an ungated child is visible no matter what the predicate says', () => {
  const item: NavItem = { to: '/g', label: 'G', children: [{ to: '/g/a', label: 'A' }] };
  assert.deepEqual(visibleChildren(item, NONE).map(k => k.label), ['A']);
  assert.equal(isReachable(item, NONE), true);
});

test('a plain destination stays reachable — the rule only gates groups', () => {
  // No `children` key at all, and the empty-array edge case: neither is a
  // group, so neither may be filtered out by the group rule.
  for (const item of [
    { to: '/employees', label: 'Employees' },
    { to: '/employees', label: 'Employees', children: [] },
  ] as NavItem[]) {
    assert.deepEqual(visibleChildren(item, NONE), []);
    assert.equal(isReachable(item, NONE), true, `${JSON.stringify(item.children)} is not a group`);
  }
});

test('reachability is exactly "visibleChildren is non-empty" for a group', () => {
  // The invariant the bug broke: the chevron is drawn off visibleChildren and
  // the row is kept off isReachable, so the two can never disagree again.
  const grants = [[], ['view_jobposting'], ['view_candidate', 'view_offer'], ['view_jobposting', 'view_candidate', 'view_offer']];
  for (const granted of grants) {
    const has = allow(granted);
    assert.equal(
      isReachable(RECRUITMENT, has),
      visibleChildren(RECRUITMENT, has).length > 0,
      `granted=${JSON.stringify(granted)}`,
    );
  }
});
