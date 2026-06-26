/**
 * Shared form-control styling — the single source of truth for the kit's
 * text-input look. Promoted out of SearchableSelect so every form control
 * (Input, Textarea, Select, SearchableSelect) renders identically and picks
 * up the same `[data-theme="dark"]` input remaps from styles.css.
 *
 * Keep this in the documented Tailwind vocabulary (see .design-sync/conventions.md)
 * so the classes survive both the dark-mode allow-list and the design-sync
 * compiled stylesheet.
 */

/** Base look for a text-bearing form control. Native <input>/<select>/<textarea>
 *  also receive dark styling for free via the global rule in styles.css. */
export const INPUT_BASE =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 ' +
  'placeholder:text-gray-400 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30';

/** Error-state ring/border, layered on top of INPUT_BASE. */
export const INPUT_INVALID =
  'border-red-300 focus:border-red-400 focus:ring-red-400/30';

/** Disabled affordance — opacity-based so it stays correct in every theme. */
export const INPUT_DISABLED = 'disabled:cursor-not-allowed disabled:opacity-60';

/** Compose the input classes for a control. */
export function inputClasses(opts?: { invalid?: boolean; className?: string }): string {
  return [INPUT_BASE, opts?.invalid ? INPUT_INVALID : '', INPUT_DISABLED, opts?.className ?? '']
    .filter(Boolean)
    .join(' ');
}
