/**
 * Regression guard for BG#00600 — "There is a huge blank area on the what's
 * new window."
 *
 * The What's New window is a normal fixed-height shell window: no
 * `dimensions`, no `autoHeight`, so its height comes off the size ladder
 * (`md` = 512px, scaled by the user's default-window-size preference, and the
 * whole work area when maximized). Its body was `bodyScroll={false}` with a
 * single child capped at `max-h-[60vh]`. A capped block cannot grow into a
 * window taller than the cap, so every pixel of body height above 60vh was
 * dead space under the last changelog entry — around 100px in a default
 * window, and a third of the window when maximized, which is the red circle
 * on the report's screenshot. The cap really was applied: the admin portal's
 * Tailwind v4 setup scans the shell's `dist`, so the arbitrary class is
 * generated.
 *
 * The fix is the Modal's own body scroll — the house mechanism every other
 * flowing-content window in the shell already uses (`WidgetSettingsModal`,
 * the entity windows) — instead of an inner box with a viewport-fraction
 * ceiling. So the claims below are: the body is the scroller, nothing inside
 * it re-caps the height, and the empty state fills rather than stranding one
 * grey line at the top of a 750px window.
 *
 * These are assertions about classes, not about pixels, and deliberately so:
 * the specs run in jsdom, which does no layout and never loads Tailwind, so
 * there is no height here to measure. What can be pinned down is the contract
 * that produces the height — which element scrolls, and that nothing between
 * the body and the list caps itself to a fraction of the viewport.
 */
import { act, render, waitForElement } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Desktop, { DesktopHostProvider, type DesktopHostConfig } from '../src/shell/Desktop';
import type { ChangelogEntry } from '../src/changelog';

const VERSION = '16.10.0-bg600';

const CHANGELOG: ChangelogEntry[] = [
  { version: '16.10.0', date: '2026-07-22', changes: ['Vehicle fitment filter on Stock on Hand'] },
  { version: '16.9.0', date: '2026-07-22', changes: ['Will Call pickup'] },
];

// The desktop version watermark is the only way into the What's New window,
// and it renders on two conditions: the preference is on, and a version
// string exists. `APP_VERSION` is '' in the specs (it is injected by tsup at
// build time), so the host has to supply one.
const PROFILE = { preferences: { show_desktop_version: true } };

function mountDesktop(host: DesktopHostConfig) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DesktopHostProvider value={host}>
        <Desktop profile={PROFILE} />
      </DesktopHostProvider>
    </QueryClientProvider>,
  );
}

async function openWhatsNew(host: DesktopHostConfig) {
  const { container } = mountDesktop(host);
  const watermark = [...container.querySelectorAll('button')]
    .find((b) => b.textContent === VERSION);
  assert.ok(watermark, 'the desktop version watermark should be rendered');
  act(() => { watermark.click(); });
  return waitForElement<HTMLElement>('[data-modal-panel]');
}

/** Every class on `el` and its ancestors up to (and including) the panel. */
function classesUpTo(el: Element, panel: Element): string[] {
  const out: string[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    out.push(...node.classList);
    if (node === panel) break;
  }
  return out;
}

test('the changelog list is not capped to a fraction of the viewport', async (t) => {
  const panel = await openWhatsNew({ productVersion: VERSION, productChangelog: CHANGELOG });
  t.after(() => { document.body.innerHTML = ''; });

  // Anchor on rendered content, so an empty changelog cannot pass this
  // vacuously: the entry heading is what the window is there to show.
  const entry = [...panel.querySelectorAll('span')]
    .find((s) => s.textContent === '16.10.0');
  assert.ok(entry, 'the changelog entries should be rendered in the window');

  const capped = classesUpTo(entry, panel).filter((c) => /^max-h-\[.*vh\]$/.test(c));
  assert.deepEqual(
    capped,
    [],
    'nothing between the window panel and a changelog entry may cap its height to a viewport '
    + 'fraction — a fixed-height window is taller than the cap, and the difference is blank space',
  );
});

test('the window body is the scroller for the changelog', async (t) => {
  const panel = await openWhatsNew({ productVersion: VERSION, productChangelog: CHANGELOG });
  t.after(() => { document.body.innerHTML = ''; });

  const list = panel.querySelector('.space-y-5');
  assert.ok(list, 'the changelog list should be rendered');
  const body = list.parentElement!;
  assert.ok(body.classList.contains('flex-1'), 'the list should sit directly in the modal body');

  assert.ok(
    body.classList.contains('overflow-y-auto'),
    'the modal body must scroll the changelog itself, rather than hand overflow to an inner box '
    + 'that cannot grow to fill the window',
  );
  assert.ok(
    !list.classList.contains('overflow-y-auto'),
    'the list must not scroll inside the body as well — two scrollers is what left the gap',
  );
});

test('an empty changelog fills the window instead of stranding a line at the top', async (t) => {
  const panel = await openWhatsNew({ productVersion: VERSION, productChangelog: [] });
  t.after(() => { document.body.innerHTML = ''; });

  const message = [...panel.querySelectorAll('p')]
    .find((p) => /no changelog|nothing/i.test(p.textContent ?? ''));
  assert.ok(message, 'the no-changelog message should be rendered');

  // The window is the same fixed height whether there is a changelog or not,
  // so the empty state has the same blank area to answer for.
  const filler = message.parentElement!;
  assert.ok(
    filler.classList.contains('flex-1') && filler.classList.contains('items-center'),
    'the no-changelog message must be centred in the space the window actually has',
  );
});
