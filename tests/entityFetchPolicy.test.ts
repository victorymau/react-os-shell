import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_FETCH_MAX_RETRIES,
  ENTITY_REFETCH_INTERVAL_MS,
  entityDetailUrl,
  entityRefetchInterval,
  isPermanentClientError,
  shouldRetryEntityFetch,
} from '../src/shell/entityFetchPolicy';

/** An axios-shaped rejection, which is all the policy ever inspects. */
const httpError = (status: number) => ({ response: { status } });

test('a 4xx is permanent — repeating it cannot change the answer', () => {
  for (const status of [400, 401, 403, 404, 409, 410, 422]) {
    assert.equal(isPermanentClientError(httpError(status)), true, String(status));
  }
});

test('408 and 429 are the 4xx that mean "wait", not "wrong"', () => {
  assert.equal(isPermanentClientError(httpError(408)), false, 'Request Timeout');
  assert.equal(isPermanentClientError(httpError(429)), false, 'Too Many Requests');
});

test('a 5xx is the server having a bad moment, not a bad request', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(isPermanentClientError(httpError(status)), false, String(status));
  }
});

test('no status means no reply arrived — exactly what retrying is for', () => {
  // A network failure, DNS blip, offline tab or aborted request never carries
  // a numeric status. Treating these as permanent would strand a window that
  // is only temporarily unreachable.
  for (const junk of [
    new Error('Network Error'),
    { response: undefined },
    { response: { status: undefined } },
    { response: { status: '404' } }, // a string is not a status
    null,
    undefined,
    {},
  ]) {
    assert.equal(isPermanentClientError(junk), false, JSON.stringify(junk) ?? String(junk));
  }
});

test('a permanently-404ing window is asked once, never retried', () => {
  // The production bug: TanStack's default retry turned each poll into four
  // requests. The first attempt has already happened by the time `retry` is
  // consulted, so refusing every failureCount means exactly one request.
  for (let failureCount = 0; failureCount < 10; failureCount++) {
    assert.equal(shouldRetryEntityFetch(failureCount, httpError(404)), false, `attempt ${failureCount}`);
  }
});

test('transient failures still get the usual three retries', () => {
  assert.equal(shouldRetryEntityFetch(0, httpError(500)), true);
  assert.equal(shouldRetryEntityFetch(ENTITY_FETCH_MAX_RETRIES - 1, httpError(500)), true);
  assert.equal(shouldRetryEntityFetch(ENTITY_FETCH_MAX_RETRIES, httpError(500)), false, 'and then stops');
  assert.equal(shouldRetryEntityFetch(0, new Error('Network Error')), true);
});

test('polling stops on a permanent 4xx and continues otherwise', () => {
  // This is the half that made 2,848 requests out of one dead window: the 60s
  // interval kept firing against a 404 for as long as the tab stayed open.
  assert.equal(entityRefetchInterval(httpError(404)), false);
  assert.equal(entityRefetchInterval(httpError(403)), false);

  assert.equal(entityRefetchInterval(null), ENTITY_REFETCH_INTERVAL_MS, 'a healthy window still polls');
  assert.equal(entityRefetchInterval(httpError(500)), ENTITY_REFETCH_INTERVAL_MS, 'so does a flaky one');
  assert.equal(entityRefetchInterval(httpError(429)), ENTITY_REFETCH_INTERVAL_MS);
});

test('a uuid id builds the same URL it always did', () => {
  assert.equal(
    entityDetailUrl('/receipts/', '67661a30-68e1-4aa9-bfa5-812136df43c7'),
    '/receipts/67661a30-68e1-4aa9-bfa5-812136df43c7/',
  );
});

test('an id carrying a # cannot silently truncate the request', () => {
  // Unencoded, `/receipts/RP#60001/` is sent as `GET /receipts/RP` — the
  // browser strips everything from the fragment on, so the server sees a
  // request nobody wrote. Encoded, a wrong id 404s as itself.
  assert.equal(entityDetailUrl('/receipts/', 'RP#60001'), '/receipts/RP%2360001/');
  assert.ok(!entityDetailUrl('/receipts/', 'RP#60001').includes('#'), 'no fragment survives');
});

test('other URL-significant characters are encoded too', () => {
  assert.equal(entityDetailUrl('/receipts/', 'a/b'), '/receipts/a%2Fb/', 'no invented path segment');
  assert.equal(entityDetailUrl('/receipts/', 'a?b=1'), '/receipts/a%3Fb%3D1/', 'no invented query string');
});
