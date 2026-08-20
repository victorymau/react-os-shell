/**
 * Give up waiting on a promise that may never settle.
 *
 * Written for PdfActionButton: the Preview window opens on a "LOADING PDF"
 * placeholder and swaps in the document when the consumer's `fetchPdf()`
 * resolves. If that promise never settles — a connection torn down mid-flight,
 * a worker killed, a request the browser abandoned — the placeholder stays on
 * screen for ever, so a document that is merely slow and one that is genuinely
 * dead look identical to the person waiting. That ambiguity is what produced
 * report BG#00511, where the only evidence available afterwards was the user's
 * memory of what the screen showed.
 *
 * The timeout resolves to {@link TIMED_OUT} rather than rejecting, because a
 * timeout is not an error the consumer raised — it is this side deciding to
 * stop waiting, and the caller needs to tell the two apart to say something
 * accurate about which happened.
 *
 * The losing promise is NOT cancelled. The shell is transport-agnostic and
 * never owns the request, so there is nothing here to abort; `work` may still
 * settle later and its result is simply dropped. Consumers that need real
 * cancellation should wire an AbortController into their own `fetchPdf`.
 */

/** Returned in place of the value when `work` did not settle in time. */
export const TIMED_OUT: unique symbol = Symbol('react-os-shell:timed-out');

export type MaybeTimedOut<T> = T | typeof TIMED_OUT;

/**
 * Resolve `work`, or {@link TIMED_OUT} if it takes longer than `ms`.
 *
 * A non-finite or non-positive `ms` disables the timeout and awaits `work`
 * unchanged, so a consumer can opt out with `0` or `Infinity` without the
 * caller branching. Rejections propagate untouched — this only ever converts
 * *silence* into a value, never a failure into a success.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<MaybeTimedOut<T>> {
  if (!Number.isFinite(ms) || ms <= 0) return work;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>(resolve => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    // Always clear it: when `work` wins, an uncleared timer holds the event
    // loop open for the rest of the interval, which in Node turns a fast unit
    // test into a slow one and in a browser keeps a closure alive needlessly.
    if (timer !== undefined) clearTimeout(timer);
  }
}
