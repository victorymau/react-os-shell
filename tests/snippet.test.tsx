import './dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, render, waitFor } from './dom';
import Snippet from '../src/forms/Snippet';

/**
 * The value a settings panel exists to hand over — an endpoint, a tenant id, a
 * key — and the one interaction it supports.
 *
 * The clipboard is stubbed rather than driven: jsdom has no `navigator.
 * clipboard` and no `execCommand('copy')`, so without a stub `writeClipboard`
 * reaches its fallback, fails, and every assertion here would be about the
 * error path. The stub is the narrowest one that makes the success path real —
 * it records what was written, which is the actual claim ("the VALUE is copied,
 * not what is displayed").
 */

const written: string[] = [];
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { async writeText(text: string) { written.push(text); } },
});

afterEach(() => {
  written.length = 0;
  document.getElementById('toast-container')?.remove();
});

const copyButton = (root: ParentNode) => root.querySelector<HTMLButtonElement>('button[aria-label^="Copy"]')!;
const live = (root: ParentNode) => root.querySelector<HTMLElement>('[aria-live="polite"]')!;

/** Click and let the copy promise and the state it sets settle. */
async function clickCopy(root: ParentNode) {
  await act(async () => { copyButton(root).click(); });
}

test('copies the value, and names what it copied', async () => {
  const view = render(<Snippet value="https://api.efficient.test/v1" label="the API base URL" />);

  assert.equal(
    copyButton(view.container).getAttribute('aria-label'),
    'Copy the API base URL',
    'an icon-only button with six siblings needs to say which value it takes',
  );

  await clickCopy(view.container);
  assert.deepEqual(written, ['https://api.efficient.test/v1']);

  view.unmount();
});

test('copies `value` even when something else is shown', async () => {
  // The whole reason `children` is separate: a masked key is what belongs on
  // the screen and is useless on the clipboard.
  const view = render(<Snippet value="sk_live_8Hf2a91c4d" label="the API key">sk_live_8Hf2…a91</Snippet>);

  assert.match(view.container.textContent ?? '', /sk_live_8Hf2…a91/);
  await clickCopy(view.container);
  assert.deepEqual(written, ['sk_live_8Hf2a91c4d'], 'the displayed text is not the value');

  view.unmount();
});

test('says "Copied" out loud, then takes it back', async () => {
  const view = render(<Snippet value="tnt_4821" />);

  assert.equal(live(view.container).textContent, '', 'the region is silent until something happens');
  // Present from the first paint: aria-live announces a CHANGE to a region
  // that was already there. One inserted at copy time announces nothing.
  assert.ok(live(view.container), 'the live region must exist before the copy');

  await clickCopy(view.container);
  assert.equal(live(view.container).textContent, 'Copied');
  assert.ok(
    copyButton(view.container).querySelector('.text-green-600'),
    'the sighted half of the same message — the check icon',
  );

  // And it resets, so a second copy announces itself as well. 2s is HeroUI's
  // timeout and the component's own constant.
  await waitFor(
    () => live(view.container).textContent === '',
    'the copied state never reset',
    { timeout: 6000 },
  );
  assert.equal(copyButton(view.container).querySelector('.text-green-600'), null);

  view.unmount();
});

test('onCopy fires with the value, after the write', async () => {
  const seen: string[] = [];
  const view = render(<Snippet value="tnt_4821" onCopy={v => seen.push(v)} />);

  await clickCopy(view.container);
  assert.deepEqual(seen, ['tnt_4821']);

  view.unmount();
});

test('hideCopyButton leaves the value and nothing to press', () => {
  const view = render(<Snippet value="tnt_4821" hideCopyButton />);

  assert.equal(view.container.querySelector('button'), null);
  assert.match(view.container.textContent ?? '', /tnt_4821/);
  assert.equal(
    view.container.querySelector('[aria-live]'),
    null,
    'no affordance, nothing to announce — a live region with no writer is noise in the tree',
  );

  view.unmount();
});

test('a single-line value is truncated and recoverable from its title', () => {
  const url = 'https://api.efficient.test/v1/tenants/8e1c/webhooks/deliveries';
  const view = render(<Snippet value={url} />);

  const text = view.container.querySelector<HTMLElement>('.font-mono')!;
  assert.match(text.className, /\btruncate\b/);
  assert.equal(text.getAttribute('title'), url, 'truncated text has to be readable somehow');

  view.unmount();
});

test('multiline wraps instead, and drops the tooltip that would repeat it', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nMIIB…\n-----END CERTIFICATE-----';
  const view = render(<Snippet value={pem} multiline />);

  const text = view.container.querySelector<HTMLElement>('.font-mono')!;
  assert.doesNotMatch(text.className, /\btruncate\b/);
  assert.match(text.className, /\bwhitespace-pre-wrap\b/);
  assert.equal(text.getAttribute('title'), null);

  view.unmount();
});

test('the symbol is decoration — never announced, never copied', async () => {
  const view = render(<Snippet value="npm ci" symbol="$" label="the command" />);

  const glyph = view.container.querySelector('[aria-hidden="true"].select-none')!;
  assert.equal(glyph.textContent, '$');

  await clickCopy(view.container);
  assert.deepEqual(written, ['npm ci'], 'a prompt is not part of the command');

  view.unmount();
});

test('no symbol unless asked — a URL has no prompt in front of it', () => {
  const view = render(<Snippet value="https://api.efficient.test/v1" />);
  assert.doesNotMatch(view.container.textContent ?? '', /\$/);
  view.unmount();
});

test('a refused clipboard says so rather than looking like it worked', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { async writeText() { throw new Error('denied'); } },
  });
  const seen: string[] = [];
  const view = render(<Snippet value="tnt_4821" onCopy={v => seen.push(v)} />);

  await clickCopy(view.container);
  // jsdom implements no `execCommand`, so the fallback fails too and the whole
  // path reports false — which is the case this asserts.
  assert.equal(live(view.container).textContent, '', 'nothing reached the clipboard, so nothing is claimed');
  assert.deepEqual(seen, [], 'onCopy is a success callback');
  await waitFor(
    () => /Could not copy/.test(document.body.textContent ?? ''),
    () => `no failure toast. Body: ${JSON.stringify(document.body.textContent ?? '')}`,
  );

  view.unmount();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { async writeText(text: string) { written.push(text); } },
  });
});
