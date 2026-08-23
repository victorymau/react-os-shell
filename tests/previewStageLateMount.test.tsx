/**
 * The Preview staging protocol, from the consumer's side.
 *
 * `PdfActionButton` stages a "LOADING PDF" placeholder, calls
 * `openPage('/preview')`, and swaps the real file in with `handle.update()`
 * when the fetch resolves. Preview is a lazy chunk, so on the first preview of
 * a session the update can be ready before any window exists to receive it —
 * and `update()` dispatches a DOM event, which nobody hears. The window then
 * sat on the placeholder for ever, with the fetch having succeeded and no
 * error anywhere: a preview that "would not load" and left no evidence.
 *
 * So the case that matters here is ORDER — update before mount, and update
 * after mount, reaching the same window. The rest guard the isolation that
 * makes the token worth having: a stale handle must not reach into a window
 * that claimed a later staging, and a closed window's update must not leak
 * into the next Preview someone opens.
 */
import { act, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Preview from '../src/apps/Preview';
import { setPdfPreview } from '../src/apps/_previewStage';

const LOADING = 'LOADING PDF';
const placeholder = (filename: string) => ({ filename, converting: true, convertingMessage: LOADING });
/** Resolve as an image: the race is in the staging protocol, not the renderer,
 *  and `kind: 'image'` keeps pdfjs out of a spec that has no business
 *  rasterising a document. */
const resolved = (filename: string, url: string) => ({ url, filename, kind: 'image' as const });

test('an update that lands before the window mounts still reaches it', async () => {
  const handle = setPdfPreview(placeholder('goods-receipt.pdf'));
  // The fetch wins the race against the lazy chunk — this is the production
  // case, not a contrived one: a cached PDF resolves in single-digit ms.
  handle.update(resolved('goods-receipt.pdf', 'blob:resolved-before-mount'));

  const { container, unmount } = render(<Preview />);
  assert.ok(
    container.innerHTML.includes('blob:resolved-before-mount'),
    'window should open on the resolved file',
  );
  assert.ok(!container.textContent?.includes(LOADING), 'placeholder should be gone');
  unmount();
});

test('an update that lands after the window mounts still reaches it', async () => {
  const handle = setPdfPreview(placeholder('invoice.pdf'));
  const { container, unmount } = render(<Preview />);
  assert.ok(container.textContent?.includes(LOADING), 'window opens on the placeholder');

  await act(() => { handle.update(resolved('invoice.pdf', 'blob:resolved-after-mount')); });
  assert.ok(
    container.innerHTML.includes('blob:resolved-after-mount'),
    'window should swap in the resolved file',
  );
  unmount();
});

test('a superseded handle does not clobber the window that claimed the next staging', async () => {
  // Two previews opened in quick succession. The first handle is still live in
  // its caller's closure; its update must not land in the second window.
  const first = setPdfPreview(placeholder('first.pdf'));
  setPdfPreview(placeholder('second.pdf'));

  const { container, unmount } = render(<Preview />);
  assert.ok(container.textContent?.includes('second.pdf'), 'window claims the latest staging');

  act(() => { first.update(resolved('first.pdf', 'blob:wrong-window')); });
  assert.ok(
    !container.innerHTML.includes('blob:wrong-window'),
    "the first preview's file must not appear in the second window",
  );
  unmount();
});

test('an update after the window closed does not leak into the next Preview', async () => {
  const handle = setPdfPreview(placeholder('closed.pdf'));
  render(<Preview />).unmount();
  act(() => { handle.update(resolved('closed.pdf', 'blob:orphaned')); });

  // Someone opens Preview from the Start menu: it belongs to them, and must
  // come up as the empty canvas rather than a document they never asked for.
  const { container, unmount } = render(<Preview />);
  assert.ok(!container.innerHTML.includes('blob:orphaned'), 'stale payload must not be drained');
  assert.ok(container.textContent?.includes('Drop a file here'), 'empty canvas');
  unmount();
});
