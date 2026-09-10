import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, render } from './dom';
import BrandAssetEditor from '../src/forms/BrandAssetEditor';

test('BrandAssetEditor stages a valid file and saves that exact file', async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:staged-brand';
  URL.revokeObjectURL = () => {};
  const saved: File[] = [];
  const view = render(
    <BrandAssetEditor
      committedUrl="/old.png"
      subjectName="INOVIT Pty Ltd"
      assetName="Compact icon"
      maxBytes={1024}
      onSave={file => { saved.push(file); }}
      onRemove={() => {}}
    />,
  );
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
  const file = new File(['new'], 'new.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  const save = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Save icon')!;
  assert.equal(save.hasAttribute('disabled'), false);
  await act(async () => { save.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  assert.deepEqual(saved, [file]);
  view.unmount();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

test('BrandAssetEditor rejects an oversized file before save', async () => {
  let saves = 0;
  const view = render(
    <BrandAssetEditor
      committedUrl={null}
      subjectName="INOVIT Pty Ltd"
      assetName="Favicon"
      maxBytes={2}
      onSave={() => { saves += 1; }}
      onRemove={() => {}}
    />,
  );
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['too large'], 'large.png', { type: 'image/png' })],
  });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match(view.container.textContent ?? '', /large\.png is 9 B — the limit is 2 B/);
  const save = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Save favicon');
  assert.equal(save?.hasAttribute('disabled'), true);
  assert.equal(saves, 0);
  view.unmount();
});

test('BrandAssetEditor rejects a file omitted from the configured accept contract', async () => {
  let saves = 0;
  const view = render(
    <BrandAssetEditor
      committedUrl={null}
      subjectName="INOVIT Pty Ltd"
      assetName="Primary logo"
      accept="image/png,image/jpeg"
      acceptHint="PNG · JPG"
      onSave={() => { saves += 1; }}
      onRemove={() => {}}
    />,
  );
  const input = view.container.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })],
  });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match(view.container.textContent ?? '', /logo\.svg is not an accepted file type \(PNG · JPG\)/);
  const save = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Save logo');
  assert.equal(save?.hasAttribute('disabled'), true);
  assert.equal(saves, 0);
  view.unmount();
});

test('BrandAssetEditor previews the same staged asset in requested portal slots', () => {
  const view = render(
    <BrandAssetEditor
      committedUrl="/icon.png"
      subjectName="INOVIT Pty Ltd"
      assetName="Compact icon"
      onSave={() => {}}
      onRemove={() => {}}
      previews={[
        { label: 'Browser tab', slot: 'favicon', kind: 'browser-tab', title: 'INOVIT Wheels' },
        { label: 'Search result', slot: 'favicon', kind: 'search-result', title: 'INOVIT Wheels', url: 'https://inovit.com.au' },
        { label: 'Portal menu', slot: 'compact', surface: 'dark' },
      ]}
    />,
  );
  assert.equal(view.container.querySelectorAll('[data-brand-preview]').length, 3);
  assert.equal(view.container.querySelectorAll('img[src="/icon.png"]').length, 4);
  assert.match(view.container.textContent ?? '', /https:\/\/inovit\.com\.au/);
  view.unmount();
});

test('BrandAssetEditor can preview an inherited fallback without offering to remove it', () => {
  const view = render(
    <BrandAssetEditor
      committedUrl={null}
      fallbackUrl="/wordmark.png"
      subjectName="INOVIT Pty Ltd"
      assetName="Compact icon"
      onSave={() => {}}
      onRemove={() => {}}
      previews={[{ label: 'Portal menu', slot: 'compact' }]}
    />,
  );
  assert.equal(view.container.querySelectorAll('img[src="/wordmark.png"]').length, 2);
  assert.equal([...view.container.querySelectorAll('button')].some(button => button.textContent === 'Remove icon'), false);
  view.unmount();
});

test('BrandAssetEditor previews the treatment metadata owned by the visible asset', () => {
  const view = render(
    <BrandAssetEditor
      committedUrl="/dark-icon.png"
      committedHasAlpha
      committedIsLight={false}
      fallbackUrl="/light-wordmark.png"
      fallbackHasAlpha
      fallbackIsLight
      subjectName="INOVIT Pty Ltd"
      assetName="Compact icon"
      onSave={() => {}}
      onRemove={() => {}}
      previews={[{ label: 'Portal menu', slot: 'compact', surface: 'dark' }]}
    />,
  );
  const treatments = [...view.container.querySelectorAll('[data-brand-treatment]')]
    .map(node => node.getAttribute('data-brand-treatment'));
  assert.deepEqual(treatments, ['plate-light']);
  view.unmount();
});
