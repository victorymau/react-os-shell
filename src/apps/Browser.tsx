/**
 * Browser — minimal iframe-backed web browser app.
 *
 * URL bar with back / forward / refresh, navigable bookmark bar
 * (persisted to localStorage), and a graceful "open in new tab"
 * escape hatch since most major sites refuse iframe embedding via
 * X-Frame-Options or Content-Security-Policy.
 */
import { useEffect, useRef, useState } from 'react';
import { WindowTitle } from '../shell/Modal';
import { confirm } from '../shell/ConfirmDialog';

interface Bookmark {
  label: string;
  url: string;
}

const BOOKMARKS_KEY = 'react-os-shell:browser-bookmarks';
const HOMEPAGE_KEY = 'react-os-shell:browser-homepage';
const DEFAULT_HOMEPAGE = 'https://en.wikipedia.org/wiki/Main_Page';
const DEFAULT_BOOKMARKS: Bookmark[] = [
  { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
  { label: 'MDN', url: 'https://developer.mozilla.org' },
  { label: 'Example', url: 'https://example.com' },
];

function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!s) return '';
  // Already a URL? Otherwise treat as a search query (DuckDuckGo, no tracking).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

// Sites known to refuse iframe embedding via X-Frame-Options or CSP. There's
// no workaround inside an iframe — the browser blocks the load. We keep a
// list so we can short-circuit to a friendly "open in new tab" panel
// instead of letting the browser's blank "refused to connect" error
// through. Subdomain match: `mail.google.com` matches `google.com`.
const BLOCKED_HOSTS = [
  'google.com', 'gmail.com', 'youtube.com',
  'facebook.com', 'instagram.com', 'whatsapp.com',
  'twitter.com', 'x.com',
  'github.com', 'gitlab.com',
  'linkedin.com', 'reddit.com', 'pinterest.com',
  'amazon.com', 'amazon.ca', 'amazon.co.uk',
  'apple.com', 'icloud.com',
  'microsoft.com', 'outlook.com', 'live.com', 'office.com',
  'netflix.com', 'spotify.com',
  'paypal.com', 'stripe.com',
  'chat.openai.com', 'chatgpt.com', 'claude.ai',
];

function hostIsBlocked(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return BLOCKED_HOSTS.some(b => host === b || host.endsWith('.' + b));
  } catch { return false; }
}

function loadBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return DEFAULT_BOOKMARKS;
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return DEFAULT_BOOKMARKS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(b => typeof b?.url === 'string')) return parsed;
  } catch {}
  return DEFAULT_BOOKMARKS;
}

function loadHomepage(): string {
  if (typeof window === 'undefined') return DEFAULT_HOMEPAGE;
  return localStorage.getItem(HOMEPAGE_KEY) || DEFAULT_HOMEPAGE;
}

export default function Browser() {
  const [homepage, setHomepage] = useState(loadHomepage);
  const [url, setUrl] = useState(homepage);
  const [inputUrl, setInputUrl] = useState(url);
  const [history, setHistory] = useState<string[]>([url]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [iframeKey, setIframeKey] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const [showHelp, setShowHelp] = useState(false);
  // Inline "name this bookmark" popover state. Populated when the user
  // clicks the star icon to add — replaces the native window.prompt().
  const [bookmarkDraft, setBookmarkDraft] = useState<string | null>(null);
  const bookmarkInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Persist bookmarks.
  useEffect(() => {
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)); } catch {}
  }, [bookmarks]);

  const navigate = (next: string) => {
    const n = normalizeUrl(next);
    if (!n) return;
    setUrl(n);
    setInputUrl(n);
    // Truncate forward history when navigating from a back state.
    setHistory(h => {
      const trimmed = h.slice(0, historyIdx + 1);
      trimmed.push(n);
      return trimmed;
    });
    setHistoryIdx(i => i + 1);
    setShowHelp(false);
  };

  const back = () => {
    if (historyIdx > 0) {
      const next = historyIdx - 1;
      setHistoryIdx(next);
      setUrl(history[next]);
      setInputUrl(history[next]);
      setShowHelp(false);
    }
  };

  const forward = () => {
    if (historyIdx < history.length - 1) {
      const next = historyIdx + 1;
      setHistoryIdx(next);
      setUrl(history[next]);
      setInputUrl(history[next]);
      setShowHelp(false);
    }
  };

  const refresh = () => setIframeKey(k => k + 1);

  const goHome = () => navigate(homepage);

  const openExternal = () => {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openBookmarkPopover = () => {
    setBookmarkDraft(titleFromUrl(url));
    // Focus + select happens in a useEffect once the input is mounted.
  };

  const commitBookmark = () => {
    const label = bookmarkDraft?.trim();
    if (!label) { setBookmarkDraft(null); return; }
    setBookmarks(b => [...b, { label, url }]);
    setBookmarkDraft(null);
  };

  // Auto-focus + select the popover input when it opens, and dismiss on
  // outside click.
  useEffect(() => {
    if (bookmarkDraft === null) return;
    bookmarkInputRef.current?.focus();
    bookmarkInputRef.current?.select();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-bookmark-popover]')) setBookmarkDraft(null);
    };
    // Defer one tick so the click that opened the popover doesn't close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [bookmarkDraft !== null]);

  const removeBookmark = (i: number) => {
    setBookmarks(b => b.filter((_, idx) => idx !== i));
  };

  const setAsHomepage = () => {
    setHomepage(url);
    try { localStorage.setItem(HOMEPAGE_KEY, url); } catch {}
  };

  const onSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputUrl);
  };

  const canBack = historyIdx > 0;
  const canForward = historyIdx < history.length - 1;
  const isBookmarked = bookmarks.some(b => b.url === url);
  const btn = 'p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 disabled:opacity-30';

  return (
    <div className="relative flex flex-col h-full bg-white">
      <WindowTitle title={`Browser - ${titleFromUrl(url)}`} />

      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <button onClick={back} disabled={!canBack} className={btn} title="Back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <button onClick={forward} disabled={!canForward} className={btn} title="Forward">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
        <button onClick={refresh} className={btn} title="Refresh">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992M3.05 9.348a9 9 0 0114.85-3.36L21.015 9.348m0 5.304a9 9 0 01-14.85 3.36l-3.115-3.36" /></svg>
        </button>
        <button onClick={goHome} className={btn} title="Home">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0l8.954 8.955M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
        </button>

        <form onSubmit={onSubmitUrl} className="flex-1 flex items-center mx-1">
          <div className="flex items-center w-full bg-white border border-gray-300 rounded focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
            <span className="px-2 text-gray-400 text-xs">{url.startsWith('https://') ? '🔒' : '⚠️'}</span>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-1 py-1 text-sm bg-transparent outline-none font-mono"
              spellCheck={false}
              placeholder="Enter URL or search…"
            />
            {url !== inputUrl && (
              <button
                type="button"
                onClick={() => setInputUrl(url)}
                className="px-1.5 text-[10px] text-gray-400 hover:text-gray-700"
                title="Reset to current URL"
              >×</button>
            )}
          </div>
        </form>

        <button
          data-bookmark-popover
          onClick={() => isBookmarked
            ? removeBookmark(bookmarks.findIndex(b => b.url === url))
            : openBookmarkPopover()}
          className={btn + ' ' + (isBookmarked ? 'text-yellow-500' : '')}
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <svg className="h-4 w-4" fill={isBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
        <button onClick={openExternal} className={btn} title="Open in new tab">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-7.5-9L21 3m0 0v6m0-6L9.75 14.25" /></svg>
        </button>
        <button onClick={() => setShowHelp(s => !s)} className={btn} title="Embedding help">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
        </button>
      </div>

      {/* Inline "name this bookmark" popover. Anchored to the right of the
          toolbar (where the star icon lives) so the visual flow matches
          how the user just clicked. Renders inside the panel so it
          inherits the window's z-stacking. */}
      {bookmarkDraft !== null && (
        <div
          data-bookmark-popover
          className="absolute right-3 top-12 z-30 w-72 bg-white border border-gray-200 rounded-md shadow-lg p-3"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Bookmark this page</div>
          <div className="text-[11px] text-gray-400 truncate mb-2 font-mono" title={url}>{url}</div>
          <input
            ref={bookmarkInputRef}
            type="text"
            value={bookmarkDraft}
            onChange={(e) => setBookmarkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitBookmark();
              else if (e.key === 'Escape') setBookmarkDraft(null);
            }}
            placeholder="Name"
            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
          <div className="flex justify-end gap-1 mt-2">
            <button
              onClick={() => setBookmarkDraft(null)}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
            >Cancel</button>
            <button
              onClick={commitBookmark}
              disabled={!bookmarkDraft.trim()}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40"
            >Save</button>
          </div>
        </div>
      )}

      {/* Bookmarks bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-white shrink-0 overflow-x-auto">
        {bookmarks.length === 0 && (
          <span className="text-[11px] text-gray-400 italic px-2">No bookmarks yet — star the address bar to add one.</span>
        )}
        {bookmarks.map((b, i) => (
          <button
            key={i}
            onClick={() => navigate(b.url)}
            onContextMenu={async (e) => {
              e.preventDefault();
              const ok = await confirm({
                title: 'Remove bookmark',
                message: `"${b.label}" will be removed from your bookmarks.`,
                confirmLabel: 'Remove',
                variant: 'danger',
              });
              if (ok) removeBookmark(i);
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] text-gray-700 hover:bg-gray-100 whitespace-nowrap"
            title={`${b.url}\n(right-click to remove)`}
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${new URL(b.url).hostname}&sz=16`}
              alt=""
              className="h-3.5 w-3.5"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
            {b.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={setAsHomepage}
          className="px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-800"
          title="Set current page as homepage"
        >Set as home</button>
      </div>

      {/* Iframe area */}
      <div className="flex-1 relative min-h-0 bg-gray-50">
        <BrowserBody
          url={url}
          iframeKey={iframeKey}
          iframeRef={iframeRef}
          openExternal={openExternal}
          showHelp={showHelp}
          dismissHelp={() => setShowHelp(false)}
        />
      </div>
    </div>
  );
}

function titleFromUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

function BrowserBody({
  url,
  iframeKey,
  iframeRef,
  openExternal,
  showHelp,
  dismissHelp,
}: {
  url: string;
  iframeKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  openExternal: () => void;
  showHelp: boolean;
  dismissHelp: () => void;
}) {
  // If the user dismisses the blocked-site panel, allow them to attempt
  // the iframe load anyway. Reset the override whenever URL changes.
  const [forceTry, setForceTry] = useState(false);
  useEffect(() => { setForceTry(false); }, [url]);

  const blocked = hostIsBlocked(url) && !forceTry;

  if (blocked) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white p-8">
        <div className="max-w-md text-center">
          <svg className="h-14 w-14 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L21 21M5.636 5.636L3 3m9 9a9 9 0 110-18 9 9 0 010 18z" />
          </svg>
          <h3 className="text-base font-semibold text-gray-800 mb-1">
            {titleFromUrl(url)} can't be embedded
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            This site sends an <span className="font-mono text-xs">X-Frame-Options</span>{' '}
            or <span className="font-mono text-xs">Content-Security-Policy</span> header
            that refuses iframe embedding. The browser blocks the load before our app
            can do anything about it.
          </p>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={openExternal}
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 inline-flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-7.5-9L21 3m0 0v6m0-6L9.75 14.25" />
              </svg>
              Open in a new tab
            </button>
            <button
              onClick={() => setForceTry(true)}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Try loading it here anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <iframe
        key={iframeKey + url}
        ref={iframeRef as React.RefObject<HTMLIFrameElement>}
        src={url}
        className="absolute inset-0 w-full h-full bg-white"
        // Sandboxing keeps embedded pages from messing with the parent
        // window state. allow-same-origin lets sites that *do* allow
        // embedding actually behave normally; allow-scripts is needed
        // for any modern site.
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-modals"
        referrerPolicy="no-referrer-when-downgrade"
      />

      {showHelp && (
        <div className="absolute top-2 right-2 max-w-sm bg-white border border-gray-200 rounded-md shadow-lg p-3 text-xs text-gray-700 z-10">
          <div className="font-medium text-gray-900 mb-1">Why is this page blank?</div>
          <p className="mb-2">
            Most major sites (Google, GitHub, banks, news) refuse to be embedded in
            an iframe via <span className="font-mono">X-Frame-Options</span> or
            Content Security Policy. There's no workaround — the browser blocks the
            load before our app can do anything.
          </p>
          <p>
            Hit the <span className="font-medium">↗</span> button to open the page in
            a real new tab. Sites that <em>do</em> allow embedding (Wikipedia, MDN,
            docs sites, your own apps) work fine in here.
          </p>
          <button
            onClick={dismissHelp}
            className="mt-2 text-[11px] text-blue-600 hover:underline"
          >Got it</button>
        </div>
      )}
    </>
  );
}
