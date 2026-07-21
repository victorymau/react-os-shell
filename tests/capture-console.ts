/**
 * Test helper — run something with `console.error` captured.
 *
 * The components report an unusable prop (an unrecognised severity token, a
 * `max` that is not a scale) on the console rather than throwing, because a
 * thrown error in a status row blanks the whole window. That makes the console
 * line part of the contract, so the specs assert on it — and capturing it also
 * keeps the expected lines out of the test output, where they read as failures.
 *
 * Not named `*.test.ts`, so the runner treats it as an import, not a spec.
 */
export function withConsoleError<T>(fn: () => T): { result: T; errors: string[] } {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((a) => String(a)).join(' '));
  };
  try {
    return { result: fn(), errors };
  } finally {
    console.error = original;
  }
}
