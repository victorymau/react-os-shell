/**
 * createWindowRegistry — composes a window registry from one or more partial
 * registry maps. Used at the consumer's App layer to merge package-bundled
 * apps with the consumer's own entity windows.
 *
 *   const windows = createWindowRegistry(
 *     bundledApps,        // utility apps + games + Google apps from the package
 *     entityWindows,      // consumer-defined entity windows (e.g. Sales Order, Invoice)
 *   );
 *
 * Later partials override earlier ones on the same key — handy when a
 * consumer wants to swap a built-in app for their own variant.
 */
import type { WindowRegistry } from './types';

export function createWindowRegistry(...partials: WindowRegistry[]): WindowRegistry {
  return Object.assign({}, ...partials);
}
