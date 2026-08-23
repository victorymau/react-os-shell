/**
 * The Spreadsheet staging protocol — the twin of `previewStageLateMount`.
 *
 * `setSpreadsheetPreview` + `handle.update()` has the same shape, and had the
 * same gap: Spreadsheet is a lazy chunk, so an update that resolved before the
 * window mounted was dispatched to nobody and lost. No shipped consumer stages
 * a placeholder here today — `openPreviewFile` and the portals both fetch
 * first and stage the finished CSV — so this is the spec that keeps the
 * published contract honest before someone relies on it.
 */
import { act, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Spreadsheet from '../src/apps/Spreadsheet';
import { setSpreadsheetPreview } from '../src/apps/_spreadsheetStage';

test('an update that lands before the window mounts still reaches it', () => {
  const handle = setSpreadsheetPreview({ csv: 'staged-cell', filename: 'staged.csv' });
  handle.update({ csv: 'resolved-cell', filename: 'resolved.csv' });

  const { container, unmount } = render(<Spreadsheet />);
  const text = container.textContent ?? '';
  assert.ok(text.includes('resolved'), 'window should open on the resolved sheet');
  assert.ok(!text.includes('staged'), 'the staged placeholder should be gone');
  unmount();
});

test('an update that lands after the window mounts still reaches it', async () => {
  const handle = setSpreadsheetPreview({ csv: 'staged-cell', filename: 'staged.csv' });
  const { container, unmount } = render(<Spreadsheet />);
  assert.ok(container.textContent?.includes('staged'), 'window opens on what was staged');

  await act(() => { handle.update({ csv: 'resolved-cell', filename: 'resolved.csv' }); });
  assert.ok(container.textContent?.includes('resolved'), 'window should swap in the update');
  unmount();
});

test('an update after the window closed does not leak into the next Spreadsheet', async () => {
  const handle = setSpreadsheetPreview({ csv: 'closed-cell', filename: 'closed.csv' });
  render(<Spreadsheet />).unmount();
  act(() => { handle.update({ csv: 'orphaned-cell', filename: 'orphaned.csv' }); });

  const { container, unmount } = render(<Spreadsheet />);
  assert.ok(!container.textContent?.includes('orphaned'), 'stale payload must not be drained');
  unmount();
});
