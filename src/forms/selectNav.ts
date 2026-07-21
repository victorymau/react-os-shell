/**
 * Pure keyboard-navigation helpers for the custom-listbox `<Select>`. Kept free
 * of React and the DOM so the option-traversal rules (skip disabled options,
 * clamp without wrapping, Home/End, letter typeahead) are unit-testable under
 * the repo's server-only test runner (`npm test`), which never mounts a DOM.
 *
 * The helpers take the minimal shape they need (`label` for typeahead,
 * `disabled` to skip), so they stay decoupled from `SelectOption`.
 */

export interface NavOption {
  label: string;
  disabled?: boolean;
}

// The helpers are generic over the option shape (they read only `label` and
// `disabled`) so they accept a `SelectOption[]` — which also carries `value` —
// without an excess-property complaint on inline option literals.

/** First selectable option, or -1 when every option is disabled/empty. */
export function firstEnabledIndex<T extends NavOption>(options: readonly T[]): number {
  for (let i = 0; i < options.length; i++) {
    if (!options[i].disabled) return i;
  }
  return -1;
}

/** Last selectable option, or -1 when every option is disabled/empty. */
export function lastEnabledIndex<T extends NavOption>(options: readonly T[]): number {
  for (let i = options.length - 1; i >= 0; i--) {
    if (!options[i].disabled) return i;
  }
  return -1;
}

/**
 * Step one selectable option in `dir` (+1 = ArrowDown, -1 = ArrowUp) from
 * `from`, skipping disabled options and clamping at the ends (no wrap — matches
 * a native `<select>`'s arrow-key behaviour). `from = -1` means "nothing active
 * yet": stepping down lands on the first option, stepping up on the last.
 */
export function nextEnabledIndex<T extends NavOption>(options: readonly T[], from: number, dir: 1 | -1): number {
  let i = from + dir;
  while (i >= 0 && i < options.length) {
    if (!options[i].disabled) return i;
    i += dir;
  }
  // Ran off the end without finding one — keep the current option if it is
  // itself selectable, otherwise fall back to the nearest end in `dir`.
  if (from >= 0 && from < options.length && !options[from].disabled) return from;
  return dir > 0 ? firstEnabledIndex(options) : lastEnabledIndex(options);
}

/**
 * Letter typeahead: find the next selectable option whose label starts with
 * `buffer` (case-insensitive), scanning forward from just after `fromIndex` and
 * wrapping around. Returns -1 when nothing matches (or the buffer is empty).
 * Passing `fromIndex = -1` starts the scan at the first option.
 */
export function matchTypeahead<T extends NavOption>(options: readonly T[], buffer: string, fromIndex: number): number {
  const q = buffer.toLowerCase();
  const n = options.length;
  if (!q || n === 0) return -1;
  for (let step = 1; step <= n; step++) {
    const i = (((fromIndex + step) % n) + n) % n;
    const o = options[i];
    if (!o.disabled && o.label.toLowerCase().startsWith(q)) return i;
  }
  return -1;
}
