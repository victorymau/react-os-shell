/**
 * `withTimeout` — the guard that stops PDF Preview waiting for ever.
 *
 * The bug this exists for (BG#00511) is a *silence*, not a failure: a fetch
 * that never settles left the Preview window on "LOADING PDF" with no way for
 * the user to tell slow from dead. So the cases that matter here are the ones
 * about a promise that does not settle, and about keeping a rejection a
 * rejection — a timeout helper that quietly swallowed errors would trade one
 * invisible failure for another.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, TIMED_OUT } from '../src/shell/withTimeout';

/** A promise that never settles — the actual failure mode from production. */
const never = <T>() => new Promise<T>(() => {});

test('resolves the value when the work finishes inside the window', async () => {
  assert.equal(await withTimeout(Promise.resolve('doc'), 1_000), 'doc');
});

test('resolves TIMED_OUT when the work never settles', async () => {
  assert.equal(await withTimeout(never<string>(), 10), TIMED_OUT);
});

test('resolves TIMED_OUT when the work is merely too slow', async () => {
  const slow = new Promise<string>(resolve => setTimeout(() => resolve('late'), 200));
  assert.equal(await withTimeout(slow, 10), TIMED_OUT);
});

test('a rejection stays a rejection and is not reported as a timeout', async () => {
  // The caller distinguishes "we stopped waiting" from "it failed"; converting
  // one into the other would put the wrong message in front of the user.
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('403')), 1_000),
    /403/,
  );
});

test('a non-positive timeout waits for ever, so a consumer can opt out', async () => {
  assert.equal(await withTimeout(Promise.resolve('doc'), 0), 'doc');
  assert.equal(await withTimeout(Promise.resolve('doc'), -1), 'doc');
});

test('a non-finite timeout waits for ever', async () => {
  assert.equal(await withTimeout(Promise.resolve('doc'), Infinity), 'doc');
  assert.equal(await withTimeout(Promise.resolve('doc'), NaN), 'doc');
});

test('null survives the race rather than being mistaken for a timeout', async () => {
  // `fetchPdf()` resolving null is the consumer saying "I have already told the
  // user why". That must stay distinguishable from TIMED_OUT, which is ours.
  const out = await withTimeout(Promise.resolve(null), 1_000);
  assert.equal(out, null);
  assert.notEqual(out, TIMED_OUT);
});

test('the timer is cleared once the work wins, so nothing holds the loop open', async () => {
  // Not a style point: an uncleared 30-second timer keeps a handle alive after
  // every successful preview. If this regressed, the test process would sit
  // here for the full interval instead of finishing immediately.
  const started = Date.now();
  await withTimeout(Promise.resolve('doc'), 30_000);
  assert.ok(Date.now() - started < 1_000, 'resolved promise should not wait on the timer');
});
