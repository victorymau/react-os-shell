import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navVisible, visibleChildren, type NavItem } from '../src/shell/nav-types';

/**
 * Regression guard for SG#00214 — a menu row that refuses when you click it.
 *
 * The supplier portal gates its Price Sheets entry on `view_supplierpricesheet`,
 * the permission that says "this role reaches price sheets at all". The PAGE is
 * gated on the narrower `view_supplier_prices`, the one that says "this role may
 * see money". Build a price-blind R&D role the natural way — copy Supplier User,
 * untick the prices permission — and the row stayed in the sidebar and 403'd.
 *
 * The tempting fix is to add the second permission to `perms`. That makes it
 * WORSE: `perms` is an any-of test, so listing both shows the row to anyone
 * holding EITHER, which is more people than before, not fewer. Hence `allPerms`.
 */

/** Mirrors a host's `hasAnyPerm`: true when ANY requested perm is granted. */
const allow = (granted: string[]) => (perms: string[]) => perms.some(p => granted.includes(p));

const PRICE_SHEETS: NavItem = {
  to: '/suppliers/price-sheets',
  label: 'Price Sheets',
  perms: ['view_supplierpricesheet'],
  allPerms: ['view_supplier_prices'],
};

test('the reported bug: reaching price sheets is not enough to see the entry', () => {
  // The price-blind R&D role — holds the list permission, not the prices one.
  const rnd = allow(['view_supplierpricesheet']);
  assert.equal(navVisible(PRICE_SHEETS, rnd), false);
});

test('a role holding both still sees it', () => {
  const full = allow(['view_supplierpricesheet', 'view_supplier_prices']);
  assert.equal(navVisible(PRICE_SHEETS, full), true);
});

test('allPerms alone does not grant the row — perms still has to pass', () => {
  // Holds the prices permission but cannot reach price sheets at all.
  const pricesOnly = allow(['view_supplier_prices']);
  assert.equal(navVisible(PRICE_SHEETS, pricesOnly), false);
});

test('allPerms needs EVERY permission, not any one of them', () => {
  const twoRequired: NavItem = { to: '/x', label: 'X', allPerms: ['a', 'b'] };
  assert.equal(navVisible(twoRequired, allow(['a'])), false);
  assert.equal(navVisible(twoRequired, allow(['b'])), false);
  assert.equal(navVisible(twoRequired, allow(['a', 'b'])), true);
});

test('the all-of test is never collapsed into one any-of call', () => {
  // The trap this guards: `hasAnyPerm(['a','b'])` is an OR, so an implementation
  // that passes the whole list in one call would wrongly show the row to someone
  // holding only 'a'. Assert on the calls themselves, not just the answer.
  const calls: string[][] = [];
  const spy = (perms: string[]) => {
    calls.push(perms);
    return perms.some(p => p === 'a');
  };
  navVisible({ allPerms: ['a', 'b'] }, spy);
  assert.deepEqual(calls, [['a'], ['b']], 'each required permission is asked for on its own');
});

test('nav data that never sets allPerms behaves exactly as before', () => {
  const anyOf: NavItem = { to: '/y', label: 'Y', perms: ['a', 'b'] };
  assert.equal(navVisible(anyOf, allow(['b'])), true, 'perms stays an any-of test');
  assert.equal(navVisible(anyOf, allow(['c'])), false);
  const ungated: NavItem = { to: '/z', label: 'Z' };
  assert.equal(navVisible(ungated, allow([])), true, 'no perms means always visible');
});

test('empty arrays are not treated as a gate', () => {
  assert.equal(navVisible({ perms: [], allPerms: [] }, allow([])), true);
});

test('children are filtered through the same rule', () => {
  const parent: NavItem = {
    to: '/company',
    label: 'Company',
    children: [
      { to: '/company/profile', label: 'Profile' },
      PRICE_SHEETS,
    ],
  };
  const rnd = allow(['view_supplierpricesheet']);
  assert.deepEqual(
    visibleChildren(parent, rnd).map(c => c.label),
    ['Profile'],
    'a nested price-sheets row is hidden too, not just a top-level one',
  );
});

test('a section can require all of its permissions', () => {
  const section = { label: 'Company', items: [], allPerms: ['a', 'b'] };
  assert.equal(navVisible(section, allow(['a'])), false);
  assert.equal(navVisible(section, allow(['a', 'b'])), true);
});
