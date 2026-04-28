export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Platform-aware modifier symbols */
export const MOD = isMac ? '\u2318' : 'Ctrl';
export const ALT = isMac ? '\u2325' : 'Alt';
export const SHIFT = '\u21E7';
export const ENTER = '\u23CE';

/** Common shortcut labels */
export const CMD_ENTER = isMac ? '\u2318\u23CE' : 'Ctrl\u23CE';
export const CMD_S = isMac ? '\u2318S' : 'Ctrl+S';
export const CMD_K = isMac ? '\u2318K' : 'Ctrl+K';
export const CMD_DOT = isMac ? '\u2318.' : 'Ctrl+.';
export const CMD_A = isMac ? '\u2318A' : 'Ctrl+A';
export const ALT_SHIFT_D = isMac ? '\u2325\u21E7D' : 'Alt+Shift+D';
export const ALT_SHIFT_E = isMac ? '\u2325\u21E7E' : 'Alt+Shift+E';
export const ALT_SHIFT_N = isMac ? '\u2325\u21E7N' : 'Alt+Shift+N';
