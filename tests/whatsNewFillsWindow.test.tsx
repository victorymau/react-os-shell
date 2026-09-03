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
 * What this file pins down is the PROPERTY, not the mechanism. There is more
 * than one correct shape here — the modal's own body scroll (what ships), or
 * `bodyScroll={false}` with a `flex-1 min-h-0 overflow-y-auto` wrapper (the
 * house flex-fill idiom, as at `Drawer.tsx:156` and `SidebarLayout.tsx:139`).
 * Both remove the dead space, so a guard that names one of them rejects a
 * correct fix. The property both satisfy and the defect does not:
 *
 *   walking from a rendered changelog entry up to `[data-modal-panel]`,
 *   exactly ONE element scrolls vertically, and it carries no `max-h-[Nvh]`.
 *
 * The pre-fix arrangement fails it on the second clause: its one scroller was
 * the capped inner box.
 *
 * These are assertions about classes, not about pixels, and deliberately so:
 * the specs run in jsdom, which does no layout and never loads Tailwind, so
 * there is no height here to measure. What can be pinned down is the contract
 * that produces the height.
 *
 * The last test covers the second half of the report's screenshot: the
 * entries are Markdown, and this window used to print the `**` on screen
 * while the portal's own two changelog surfaces rendered them properly.
 */
import { act, render, waitForElement } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Desktop, { DesktopHostProvider, type DesktopHostConfig } from '../src/shell/Desktop';
import type { ChangelogEntry } from '../src/changelog';

const VERSION = '16.10.0-bg600';

const CHANGELOG: ChangelogEntry[] = [
  { version: '16.10.0', date: '2026-07-22', changes: ['**Commission Plans** on Stock on Hand'] },
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

/** `el` and its ancestors up to (and including) the window panel. */
function chainUpTo(el: Element, panel: Element): Element[] {
  const out: Element[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    out.push(node);
    if (node === panel) break;
  }
  return out;
}

/** Tailwind classes that make an element scroll on the vertical axis. */
const SCROLLS_Y = /^overflow(?:-y)?-(?:auto|scroll)$/;
/** A height ceiling written as a fraction of the viewport. */
const VIEWPORT_CAP = /^max-h-\[.*vh\]$/;

const describe = (el: Element) =>
  `<${el.tagName.toLowerCase()} class="${el.className}">`;

test('exactly one uncapped scroller stands between the window and a changelog entry', async (t) => {
  const panel = await openWhatsNew({ productVersion: VERSION, productChangelog: CHANGELOG });
  t.after(() => { document.body.innerHTML = ''; });

  // Anchor on rendered content, so an empty changelog cannot pass this
  // vacuously: the entry heading is what the window is there to show.
  const entry = [...panel.querySelectorAll('span')]
    .find((s) => s.textContent === '16.10.0');
  assert.ok(entry, 'the changelog entries should be rendered in the window');

  const chain = chainUpTo(entry, panel);
  const scrollers = chain.filter((el) => [...el.classList].some((c) => SCROLLS_Y.test(c)));

  assert.deepEqual(
    scrollers.map(describe),
    scrollers.slice(0, 1).map(describe),
    'exactly one element between a changelog entry and the window panel may scroll vertically — '
    + 'a second one nested inside the first is the arrangement that left the gap',
  );
  assert.equal(scrollers.length, 1, 'the changelog must be scrolled by something inside the window');

  const capped = [...scrollers[0].classList].filter((c) => VIEWPORT_CAP.test(c));
  assert.deepEqual(
    capped,
    [],
    'the scroller may not cap its height to a fraction of the viewport — a fixed-height window is '
    + 'taller than the cap, and the difference is blank space under the last entry',
  );
});

test('an empty changelog fills the window instead of stranding a line at the top', async (t) => {
  const panel = await openWhatsNew({ productVersion: VERSION, productChangelog: [] });
  t.after(() => { document.body.innerHTML = ''; });

  const message = [...panel.querySelectorAll('p')]
    .find((p) => /no changelog|nothing/i.test(p.textContent ?? ''));
  assert.ok(message, 'the no-changelog message should be rendered');

  // The window is the same fixed height whether there is a changelog or not,
  // so the empty state has the same blank area to answer for. `flex-1` is how
  // it claims that space; the `HelpCenter` empty state does the same thing
  // with the same classes (`HelpCenter.tsx:257`).
  const filler = message.parentElement!;
  assert.ok(
    filler.classList.contains('flex-1') && filler.classList.contains('items-center'),
    'the no-changelog message must be centred in the space the window actually has',
  );
});

test('Markdown in a changelog entry is rendered, not printed', async (t) => {
  const panel = await openWhatsNew({ productVersion: VERSION, productChangelog: CHANGELOG });
  t.after(() => { document.body.innerHTML = ''; });

  assert.ok(
    !(panel.textContent ?? '').includes('**'),
    'a bold marker must not survive to the rendered text — consumers write these entries in '
    + 'Markdown, and this window used to print the asterisks on screen',
  );
  const bold = [...panel.querySelectorAll('strong')]
    .find((s) => s.textContent === 'Commission Plans');
  assert.ok(bold, 'the bold span should be rendered as <strong>, as the portal already does');
});
