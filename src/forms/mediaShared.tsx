/**
 * Internal helpers shared by the media-upload primitives (`MediaUploadField`
 * single slot + `MediaUploadGrid` gallery) so the filename derivation, the
 * image-vs-video test, and the upload glyph / spinner live in one place (DRY /
 * SSoT). Not part of the public API except `mediaFileName`, which the field
 * re-exports.
 */

/**
 * Derive a human filename from a media URL: drop the query string, strip a
 * 32-hex upload prefix, and URL-decode.
 *
 *   "/media/uploads/9f3…a1_My Clip.mp4?v=2"  →  "My Clip.mp4"
 */
export function mediaFileName(url: string): string {
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
 * Best-effort image-vs-video guess for a preview: extension first, then the
 * `accept` string when it is video-only. Callers that mint extensionless blob
 * URLs (the native fallback) track the MIME themselves and OR it in.
 */
export function isVideoUrl(url: string | null | undefined, accept = ''): boolean {
  if (!url) return false;
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
