/**
 * Internal helpers shared by the media-upload primitives (`MediaUploadField`
 * single slot + `MediaUploadGrid` gallery) so the filename derivation, the
 * image-vs-video test, and the upload glyph / spinner live in one place (DRY /
 * SSoT). Not part of the public API except `mediaFileName`, which the field
 * re-exports.
 */

/** `data:image/svg+xml;base64,…` → captures the `image` type and `svg+xml` subtype. */
const DATA_URL_RE = /^data:([a-z0-9!#$&^_.+-]+)\/([a-z0-9!#$&^_.+-]+)/i;

/**
 * Name a `data:` URL from its media type alone, never its payload.
 *
 * A data URL carries no path, so the generic derivation below would slice at
 * the `/` inside the media type and hand back the whole base64 body as the
 * "filename" — hundreds of kilobytes, straight into an `alt` attribute.
 *
 *   "data:image/png;base64,iVBORw0KGgo…"      →  "image.png"
 *   "data:image/svg+xml;base64,PHN2Zy…"       →  "image.svg"
 *   "data:image/vnd.microsoft.icon;base64,…"  →  "image.icon"
 *   "data:,hello"  (no media type)            →  "media"
 */
function dataUrlName(url: string): string {
  const m = DATA_URL_RE.exec(url);
  if (!m) return 'media';
  const [, type, subtype] = m;
  // `svg+xml` → `svg` (drop the structured-syntax suffix), then take the last
  // dot-segment of a tree'd subtype (`vnd.microsoft.icon` → `icon`) and shed a
  // vendor/experimental `x-` prefix (`x-icon` → `icon`).
  const ext = subtype.split('+')[0].split('.').pop()!.replace(/^x-/i, '');
  return ext ? `${type.toLowerCase()}.${ext.toLowerCase()}` : 'media';
}

/**
 * Derive a human filename from a media URL: drop the query string, strip a
 * 32-hex upload prefix, and URL-decode.
 *
 *   "/media/uploads/9f3…a1_My Clip.mp4?v=2"  →  "My Clip.mp4"
 *
 * `data:` URLs have no path, so they are named from their media type instead
 * — see `dataUrlName`.
 */
export function mediaFileName(url: string): string {
  if (/^data:/i.test(url || '')) return dataUrlName(url);
  const path = (url || '').split('?')[0].split('#')[0];
  const last = path.substring(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(last.replace(/^[0-9a-f]{32}_/i, '')) || last || 'media';
  } catch {
    return last || 'media';
  }
}

const VIDEO_EXT_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;

/**
 * Best-effort image-vs-video guess for a preview: media type for a `data:`
 * URL, then extension, then the `accept` string when it is video-only. Callers
 * that mint extensionless blob URLs (the native fallback) track the MIME
 * themselves and OR it in.
 */
export function isVideoUrl(url: string | null | undefined, accept = ''): boolean {
  if (!url) return false;
  // A data URL states its kind in the media type and never carries an
  // extension, so `VIDEO_EXT_RE` can't match one — `data:video/mp4;base64,…`
  // would previously fall through and preview as a broken `<img>`. When the
  // type is present it is authoritative: an `image/*` data URL is not a video
  // even in a video-only picker. A typeless `data:,…` has nothing to go on and
  // falls through to the guess below.
  const data = DATA_URL_RE.exec(url);
  if (data) return data[1].toLowerCase() === 'video';
  const acceptsVideo = accept.includes('video');
  const acceptsImage = accept.includes('image') || accept === '*' || accept === '';
  return VIDEO_EXT_RE.test(url) || (acceptsVideo && !acceptsImage);
}

/** Spinner matching the kit's Button spinner — muted grey, `currentColor` fill. */
export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-gray-400`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/** Upload-arrow glyph — inherits colour, matching the kit's line-icon style. */
export function UploadGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
    >
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
