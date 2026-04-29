declare const __PKG_VERSION__: string | undefined;

/** Package version, injected by tsup at build time. Stays as an empty
 *  string when the source is consumed without a build (e.g. tests). */
export const VERSION: string = typeof __PKG_VERSION__ === 'string' ? __PKG_VERSION__ : '';

/** Legacy alias kept so existing consumers do not break. */
export const APP_VERSION = VERSION;
