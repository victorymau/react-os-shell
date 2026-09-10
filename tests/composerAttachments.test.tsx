import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { act, render } from './dom';
import ComposerAttachments, { AttachButton, AttachmentList } from '../src/forms/ComposerAttachments';
import Textarea from '../src/forms/Textarea';

/**
 * The composer attachment primitive (harness UI-15 / PAT-10): the paperclip,
 * a drop anywhere on the composer, and a paste into the text area all reach
 * the same pending list through the same checks. Before this every portal
 * composer wired the three itself, and three of them took a pasted screenshot
 * but not a dropped one.
 */

const png = (name = 'a.png', bytes = 'png') => new File([bytes], name, { type: 'image/png' });

function withDataTransfer(type: string, files: File[]) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files, types: ['Files'], items: [] } });
  return e;
}

function pasteEvent(files: File[], text = '') {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', {
    value: { files, items: [], getData: () => text, types: files.length ? ['Files'] : ['text/plain'] },
  });
  return e;
}

function Harness({ initial = [] as File[], onReject }: { initial?: File[]; onReject?: (r: unknown[]) => void }) {
  return (
    <Stateful initial={initial}>
      {(files, setFiles) => (
        <ComposerAttachments files={files} onChange={setFiles} accept="image/*" maxFiles={2} onReject={onReject}>
          <Textarea aria-label="Message" />
        </ComposerAttachments>
      )}
    </Stateful>
  );
}

function Stateful({ initial, children }: { initial: File[]; children: (files: File[], set: (f: File[]) => void) => React.ReactNode }) {
  const [files, setFiles] = useState<File[]>(initial);
  return <>{children(files, setFiles)}</>;
}

test('a paste carrying a file into the text area attaches it; a text paste is left alone', async () => {
  const view = render(<Harness />);
  const textarea = view.container.querySelector('textarea')!;
  const filePaste = pasteEvent([png('shot.png')]);
  await act(async () => { textarea.dispatchEvent(filePaste); });
  assert.equal(filePaste.defaultPrevented, true, 'the file paste is consumed');
  assert.match(view.container.textContent ?? '', /shot\.png/);
  assert.match(view.container.textContent ?? '', /Attach files \(1\)/);

  const textPaste = pasteEvent([], 'hello');
  await act(async () => { textarea.dispatchEvent(textPaste); });
  assert.equal(textPaste.defaultPrevented, false, 'a text paste reaches the text area untouched');
  view.unmount();
});

test('a drop anywhere on the composer attaches, the overlay shows while dragging, and limits announce', async () => {
  const rejected: unknown[][] = [];
  const view = render(<Harness onReject={r => rejected.push(r)} />);
  const zone = view.container.firstElementChild!;
  await act(async () => { zone.dispatchEvent(withDataTransfer('dragenter', [])); });
  assert.match(view.container.textContent ?? '', /Drop files to attach/, 'overlay while a file drag is over');
  await act(async () => { zone.dispatchEvent(withDataTransfer('drop', [png('1.png'), png('2.png'), png('3.png')])); });
  assert.doesNotMatch(view.container.textContent ?? '', /Drop files to attach/, 'overlay gone after the drop');
  const alert = view.container.querySelector('[role="alert"]')!;
  assert.match(alert.textContent ?? '', /3\.png was not added — 2 files is the limit/);
  assert.equal(rejected.length, 1, 'onReject saw the batch once');
  assert.match(view.container.textContent ?? '', /Attach files \(2\)/);
  view.unmount();
});

test('removing a chip drops that file and clears the announcement', async () => {
  const view = render(<Harness initial={[png('keep.png'), png('drop.png')]} />);
  const remove = view.container.querySelector('button[aria-label="Remove drop.png"]')!;
  await act(async () => { remove.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.doesNotMatch(view.container.textContent ?? '', /drop\.png/);
  assert.match(view.container.textContent ?? '', /keep\.png/);
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  view.unmount();
});

test('the native input is not a tab stop; the paperclip opens it', () => {
  const view = render(<Harness />);
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
  assert.equal(input.tabIndex, -1);
  assert.equal(input.multiple, true);
  const trigger = [...view.container.querySelectorAll('button')].find(b => /Attach files/.test(b.textContent ?? ''));
  assert.ok(trigger, 'one labelled trigger');
  view.unmount();
});

test('AttachmentList mints one object URL per image and revokes it on removal and unmount', async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let minted = 0;
  const revoked: string[] = [];
  URL.createObjectURL = () => `blob:${++minted}`;
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
  const a = png('a.png');
  const b = new File(['%PDF'], 'b.pdf', { type: 'application/pdf' });
  const view = render(<AttachmentList files={[a, b]} onRemove={() => {}} />);
  assert.equal(minted, 1, 'only the image gets a thumbnail');
  assert.equal(view.container.querySelectorAll('img').length, 1);
  await view.rerender(<AttachmentList files={[b]} onRemove={() => {}} />);
  assert.deepEqual(revoked, ['blob:1'], 'revoked when the image left the list');
  await view.rerender(<AttachmentList files={[b, a]} onRemove={() => {}} />);
  assert.equal(minted, 2);
  view.unmount();
  assert.deepEqual(revoked, ['blob:1', 'blob:2'], 'revoked on unmount');
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

test('the icon trigger keeps its accessible name and carries the count', () => {
  const view = render(<AttachButton variant="icon" count={3} onClick={() => {}} />);
  const button = view.container.querySelector('button')!;
  assert.equal(button.getAttribute('aria-label'), 'Attach files (3)');
  view.unmount();
});
