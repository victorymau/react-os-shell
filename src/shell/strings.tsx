/**
 * ShellStrings — the shell's user-facing strings, in one typed catalog.
 *
 * Every string here was hardcoded English at its call site, which made the
 * shell untranslatable no matter what the consuming portal did. The catalog
 * is the fix's whole shape: components read strings through `useShellStrings`
 * (which works with NO provider — the English defaults are the context
 * default), and a consumer that wants another language mounts
 * `ShellStringsProvider` once with a partial override. Overrides merge per
 * SECTION, so translating the window controls does not oblige anyone to
 * translate the help viewer.
 *
 * This is deliberately not an i18n library: no message IDs, no interpolation
 * DSL, no plural rules. The shell's strings are labels and short sentences;
 * a typed object keeps them discoverable and lets TypeScript flag a
 * translation that goes stale when a string is added.
 *
 * Prop-level text (a `emptyText` prop, a `placeholder`) always wins over the
 * catalog — the catalog replaces hardcoded DEFAULTS, never a caller's words.
 *
 * Kit-safe: no window-manager import, so `react-os-shell/ui` consumers get it
 * too.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface ShellStrings {
  /** Window chrome: control tooltips and the title bar's accessible name. */
  window: {
    minimize: string;
    maximize: string;
    windowed: string;
    pinOnTop: string;
    unpin: string;
    close: string;
    /** Suffix of the title bar's aria-label: `"{title} — {windowSuffix}"`. */
    windowSuffix: string;
    prev: string;
    next: string;
    snapLayouts: string;
    snapLeft: string;
    snapRight: string;
    snapTopLeft: string;
    snapTopRight: string;
    snapBottomLeft: string;
    snapBottomRight: string;
  };
  /** Taskbar and exposé. */
  taskbar: {
    closeWindow: string;
    offscreenHint: string;
    offscreenDot: string;
    expose: string;
    addToDesktop: string;
    removeFromDesktop: string;
    /** Group menu — a taskbar tab standing for more than one window. The
     *  count is appended by the caller, e.g. "Close all (3)". */
    minimizeAllWindows: string;
    restoreAllWindows: string;
    closeAllWindows: string;
  };
  /** The logout cover. */
  logout: {
    goodbye: string;
    seeYou: string;
  };
  /** About + What's New dialogs. */
  about: {
    aboutPrefix: string;
    thisApp: string;
    openSourceLicenses: string;
    whatsNew: string;
    noChangelog: string;
  };
  /** Data-display defaults (DataTable, lists). */
  table: {
    empty: string;
    loading: string;
    selectAll: string;
    selectRow: string;
  };
  /** Picker defaults (SearchableSelect, TagInput). */
  select: {
    none: string;
    noMatches: string;
    allSelected: string;
    clear: string;
    /** aria-label of a TagInput chip's remove button: `"{remove} {label}"`. */
    remove: string;
  };
  /** Notification bell + popup. */
  notifications: {
    title: string;
    markAllRead: string;
    dnd: string;
    dndOn: string;
    caughtUp: string;
    empty: string;
    viewAll: string;
    cardLabel: string;
    dismiss: string;
  };
  /** Form-level messages. */
  form: {
    errorSummaryTitle: string;
  };
  /** HelpCenter chrome. */
  help: {
    title: string;
    searchPlaceholder: string;
    empty: string;
    noResults: string;
    loading: string;
    pickArticle: string;
    noBody: string;
    draft: string;
    newArticle: string;
    edit: string;
  };
}

export const DEFAULT_SHELL_STRINGS: ShellStrings = {
  window: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    windowed: 'Windowed',
    pinOnTop: 'Pin on top',
    unpin: 'Unpin from top',
    close: 'Close',
    windowSuffix: 'window',
    prev: 'Prev',
    next: 'Next',
    snapLayouts: 'Snap layouts',
    snapLeft: 'Snap left half',
    snapRight: 'Snap right half',
    snapTopLeft: 'Snap top-left quarter',
    snapTopRight: 'Snap top-right quarter',
    snapBottomLeft: 'Snap bottom-left quarter',
    snapBottomRight: 'Snap bottom-right quarter',
  },
  taskbar: {
    closeWindow: 'Close window',
    offscreenHint: 'This window is off screen — click to bring it back',
    offscreenDot: 'Off screen — click to bring this window back',
    expose: 'Exposé — show all open windows as thumbnails',
    addToDesktop: 'Add to desktop',
    removeFromDesktop: 'Remove from desktop',
    minimizeAllWindows: 'Minimize all',
    restoreAllWindows: 'Restore all',
    closeAllWindows: 'Close all',
  },
  logout: {
    goodbye: 'Goodbye',
    seeYou: 'See you next time',
  },
  about: {
    aboutPrefix: 'About',
    thisApp: 'this app',
    openSourceLicenses: 'Open Source Licenses',
    whatsNew: "What's New",
    noChangelog: 'No changelog available.',
  },
  table: {
    empty: 'Nothing to show',
    loading: 'Loading',
    selectAll: 'Select all rows',
    selectRow: 'Select row',
  },
  select: {
    none: '— None —',
    noMatches: 'No matches',
    allSelected: 'All options selected',
    clear: 'Clear selection',
    remove: 'Remove',
  },
  notifications: {
    title: 'Notifications',
    markAllRead: 'Mark all read',
    dnd: 'Do not disturb',
    dndOn: 'Do not disturb is on',
    caughtUp: 'All caught up',
    empty: 'No notifications yet',
    viewAll: 'View all notifications',
    cardLabel: 'Notification',
    dismiss: 'Dismiss notification',
  },
  form: {
    errorSummaryTitle: 'There is a problem',
  },
  help: {
    title: 'Help',
    searchPlaceholder: 'Search help…',
    empty: 'No help articles yet.',
    noResults: 'No articles match your search.',
    loading: 'Loading…',
    pickArticle: 'Pick a help article from the left.',
    noBody: 'This article has no body yet.',
    draft: 'Draft',
    newArticle: '+ New',
    edit: 'Edit',
  },
};

/** A per-section partial: override any subset of a section's strings. */
export type ShellStringsOverride = {
  [S in keyof ShellStrings]?: Partial<ShellStrings[S]>;
};

const ShellStringsContext = createContext<ShellStrings>(DEFAULT_SHELL_STRINGS);

/**
 * Mount once, near the top of the app. `value` is a partial — sections and
 * keys you do not translate keep their English defaults, so a catalog never
 * breaks by falling behind a release.
 */
export function ShellStringsProvider({ value, children }: { value: ShellStringsOverride; children: ReactNode }) {
  const merged = useMemo<ShellStrings>(() => {
    const out = {} as ShellStrings;
    for (const key of Object.keys(DEFAULT_SHELL_STRINGS) as (keyof ShellStrings)[]) {
      out[key] = { ...DEFAULT_SHELL_STRINGS[key], ...(value[key] ?? {}) } as never;
    }
    return out;
  }, [value]);
  return <ShellStringsContext.Provider value={merged}>{children}</ShellStringsContext.Provider>;
}

/** The active catalog — English defaults when no provider is mounted. */
export function useShellStrings(): ShellStrings {
  return useContext(ShellStringsContext);
}
