import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSeverityTone, resolveSeverity, SEVERITY_TONES, severityOf } from '../src/shell/severity';
import { withConsoleError } from './capture-console';

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

test('a non-finite bound is an absent bound, not one nothing exceeds', () => {
  // `value >= NaN` is false, so an unguarded NaN warn silently returned
  // 'success' — a verdict invented out of a missing threshold.
  assert.equal(severityOf(50, NaN, 90), 'success', 'crit still judges');
  assert.equal(severityOf(95, NaN, 90), 'danger');
  assert.equal(severityOf(95, 80, NaN), 'warning', 'warn still judges');
  assert.equal(severityOf(50, NaN, NaN), null, 'no usable bound means no verdict');
  assert.equal(severityOf(50, Infinity, Infinity), null);
});

test('isSeverityTone accepts exactly the three tones', () => {
  for (const tone of SEVERITY_TONES) assert.equal(isSeverityTone(tone), true, tone);
  // Everything a backend rollup might realistically send instead.
  for (const junk of ['ok', 'warn', 'crit', 'critical', 'Danger', '', 'error', 0, null, undefined, {}, ['danger']]) {
    assert.equal(isSeverityTone(junk), false, JSON.stringify(junk) ?? String(junk));
  }
});

test('resolveSeverity separates absent, valid and invalid', () => {
  assert.equal(resolveSeverity(undefined, 'T'), null, 'absent is not an error');
  assert.equal(resolveSeverity(null, 'T'), null);

  const ok = resolveSeverity('warning', 'T');
  assert.deepEqual(ok, { tone: 'warning', fill: 'bg-amber-500', ink: 'text-amber-600', word: 'warning' });

  const bad = withConsoleError(() => resolveSeverity('crit', 'T'));
  assert.equal(bad.result?.tone, null, 'no verdict is claimed');
  assert.notEqual(bad.result?.fill.trim(), '', 'but paint is guaranteed');
  assert.notEqual(bad.result?.word.trim(), '', 'and so is wording');
  assert.equal(bad.errors.length, 1);
});

test('a runaway token cannot become a runaway tooltip', () => {
  const { result } = withConsoleError(() => resolveSeverity('x'.repeat(500), 'T'));
  assert.ok(result);
  assert.ok(result.word.length < 64, `capped, got ${result.word.length}`);
  assert.match(result.word, /…/, 'and says it was truncated');
});

test('the barrel exports the new surface', () => {
  // The components are unreachable to consumers until index.ts says so, and a
  // missing export is invisible to every other test in this file.
  const barrel = readFileSync(`${process.env.REPO_ROOT}/src/index.ts`, 'utf8');
  for (const line of [
    "export { default as MetricBar } from './shell/MetricBar';",
    "export type { MetricBarProps } from './shell/MetricBar';",
    "export { severityOf, isSeverityTone } from './shell/severity';",
    "export type { SeverityTone } from './shell/severity';",
  ]) {
    assert.ok(barrel.includes(line), `src/index.ts is missing: ${line}`);
  }
});
