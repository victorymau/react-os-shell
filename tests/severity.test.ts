import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { severityOf } from '../src/shell/severity';

test('no bounds means no verdict — never a default threshold', () => {
  assert.equal(severityOf(94.2), null);
  assert.equal(severityOf(94.2, null, null), null);
});

test('no reading means no verdict, and is not zero', () => {
  assert.equal(severityOf(null, 80, 90), null);
  assert.equal(severityOf(undefined, 80, 90), null);
  assert.equal(severityOf(NaN, 80, 90), null);
  assert.equal(severityOf(0, 80, 90), 'success', 'a measured zero IS a verdict');
});

test('both bounds are inclusive', () => {
  assert.equal(severityOf(79.99, 80, 90), 'success');
  assert.equal(severityOf(80, 80, 90), 'warning');
  assert.equal(severityOf(89.99, 80, 90), 'warning');
  assert.equal(severityOf(90, 80, 90), 'danger');
});

test('a single bound still judges', () => {
  assert.equal(severityOf(85, 80), 'warning');
  assert.equal(severityOf(70, 80), 'success');
  assert.equal(severityOf(95, null, 90), 'danger');
  assert.equal(severityOf(85, null, 90), 'success');
});

test('the barrel exports the new surface', () => {
  // The components are unreachable to consumers until index.ts says so, and a
  // missing export is invisible to every other test in this file.
  const barrel = readFileSync(`${process.env.REPO_ROOT}/src/index.ts`, 'utf8');
  for (const line of [
    "export { default as MetricBar } from './shell/MetricBar';",
    "export type { MetricBarProps } from './shell/MetricBar';",
    "export { severityOf } from './shell/severity';",
    "export type { SeverityTone } from './shell/severity';",
  ]) {
    assert.ok(barrel.includes(line), `src/index.ts is missing: ${line}`);
  }
});
