import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from 'react';
import { act, render } from './dom';
import FilePicker from '../src/forms/FilePicker';
import MediaUploadField from '../src/forms/MediaUploadField';
import MediaUploadGrid from '../src/forms/MediaUploadGrid';
import { acceptsFile } from '../src/forms/useFileIntake';

/**
 * One intake path for every gesture (harness UI-15 / PAT-10).
 *
 * Before `useFileIntake`, `accept` reached the native dialog only, so a file
 * DROPPED onto a zone bypassed it; a multi-file drop onto the gallery kept the
 * first file and lost the rest silently; the rejection list was plain red text
 * no screen reader announced; and the `sr-only` input behind FilePicker's
 * "Choose files" button was a second tab stop for one action. Each of those is
 * pinned here.
 */

const png = (name = 'a.png', bytes = 'png') => new File([bytes], name, { type: 'image/png' });
const pdf = (name = 'doc.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });

/** A drop event carrying `files`, shaped the way React reads `dataTransfer` off the native event. */
function dropEvent(files: File[]) {
  const e = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files, types: ['Files'], items: [] } });
  return e;
}

async function dropOn(el: Element, files: File[]) {
  await act(async () => { el.dispatchEvent(dropEvent(files)); });
}

async function pickVia(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

test('acceptsFile matches extension, type prefix and exact type; empty accepts all', () => {
  assert.equal(acceptsFile(pdf(), '.pdf'), true);
  assert.equal(acceptsFile(pdf(), 'application/pdf'), true);
  assert.equal(acceptsFile(png(), 'image/*'), true);
  assert.equal(acceptsFile(png(), '.pdf,application/pdf'), false);
  assert.equal(acceptsFile(png(), ''), true);
  assert.equal(acceptsFile(png(), '*'), true);
  // Browsers report several types for one .ico and sometimes none — the extension rule is what saves it.
  assert.equal(acceptsFile(new File([''], 'fav.ico', { type: '' }), 'image/png,.ico'), true);
});

test('FilePicker enforces accept on a DROP, and announces the rejection', async () => {
  const changes: File[][] = [];
  const view = render(
    <FilePicker files={[]} onChange={f => changes.push(f)} accept=".pdf,application/pdf" acceptHint="PDF" />,
  );
  const zone = view.container.querySelector('button')!;
  await dropOn(zone, [png('photo.png'), pdf('spec.pdf')]);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].map(f => f.name), ['spec.pdf']);
  const alert = view.container.querySelector('[role="alert"]')!;
  assert.ok(alert, 'rejection is announced');
  assert.match(alert.textContent ?? '', /photo\.png is not an accepted file type \(PDF\)/);
  view.unmount();
});

test('FilePicker keeps the size and count rules on a drop', async () => {
  const changes: File[][] = [];
  const view = render(
    <FilePicker files={[png('held.png')]} onChange={f => changes.push(f)} maxSizeBytes={4} maxFiles={2} />,
  );
  const zone = view.container.querySelector('button')!;
  await dropOn(zone, [png('big.png', 'too large'), png('ok.png', 'ok'), png('third.png', 'no')]);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].map(f => f.name), ['held.png', 'ok.png']);
  const text = view.container.querySelector('[role="alert"]')!.textContent ?? '';
  assert.match(text, /big\.png is 9 B — the limit is 4 B/);
  assert.match(text, /third\.png was not added — 2 files is the limit/);
  view.unmount();
});

test('FilePicker is one tab stop: the zone is a button, the native input is not focusable', () => {
  const ref = createRef<HTMLButtonElement>();
  const view = render(<FilePicker ref={ref} files={[]} onChange={() => {}} label="Attachments" />);
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
  assert.equal(input.tabIndex, -1);
  assert.equal(input.getAttribute('aria-hidden'), 'true');
  assert.equal(ref.current?.tagName, 'BUTTON', 'ref reaches the focusable zone');
  const label = view.container.querySelector('label')!;
  assert.equal(label.getAttribute('for'), ref.current!.id, 'the label names the zone, not the hidden input');
  view.unmount();
});

test('MediaUploadGrid delivers EVERY file of a multi-file drop to onFiles', async () => {
  const received: File[][] = [];
  const view = render(<MediaUploadGrid items={[]} onFiles={f => received.push(f)} accept="image/*" />);
  const group = view.container.querySelector('[role="group"]')!;
  await dropOn(group, [png('1.png'), png('2.png'), png('3.png')]);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].map(f => f.name), ['1.png', '2.png', '3.png']);
  view.unmount();
});

test('MediaUploadGrid on the onPick contract still receives every dropped file, one call each', async () => {
  const picked: (File | undefined)[] = [];
  const view = render(<MediaUploadGrid items={[]} onPick={f => picked.push(f)} accept="image/*" />);
  const group = view.container.querySelector('[role="group"]')!;
  await dropOn(group, [png('1.png'), pdf('not-an-image.pdf'), png('2.png')]);
  assert.deepEqual(picked.map(f => f?.name), ['1.png', '2.png']);
  assert.match(view.container.querySelector('[role="alert"]')!.textContent ?? '', /not-an-image\.pdf/);
  view.unmount();
});

test('MediaUploadGrid with onFiles has a native dialog behind the Add tile', async () => {
  const received: File[][] = [];
  const view = render(<MediaUploadGrid items={[]} onFiles={f => received.push(f)} />);
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement | null;
  assert.ok(input, 'the grid owns the gesture when nobody injects a picker');
  assert.equal(input!.multiple, true);
  await pickVia(input!, [png('x.png')]);
  assert.deepEqual(received[0].map(f => f.name), ['x.png']);
  view.unmount();
});

test('MediaUploadField hands a picked file to onFile and rejects an oversized drop', async () => {
  const got: File[] = [];
  const view = render(
    <MediaUploadField value="" onChange={() => {}} onFile={f => got.push(f)} accept="image/*" maxSizeBytes={3} />,
  );
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
  await pickVia(input, [png('ok.png', 'ok')]);
  assert.deepEqual(got.map(f => f.name), ['ok.png']);
  const zone = view.container.querySelector('button')!;
  await dropOn(zone, [png('huge.png', 'far too big')]);
  assert.equal(got.length, 1, 'the oversized drop was not delivered');
  assert.match(view.container.querySelector('[role="alert"]')!.textContent ?? '', /huge\.png is 11 B — the limit is 3 B/);
  view.unmount();
});
