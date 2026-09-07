import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingRow from '../src/shell/SettingRow';
import Switch from '../src/forms/Switch';
import StatusBadge, { StatusBadgeProvider } from '../src/shell/StatusBadge';

/**
 * The row a settings panel actually needs.
 *
 * What it replaces is a fixed narrow description column: the name and the
 * sentence explaining it shared one lane, the value shared another, and a
 * six-character badge in the value lane folded onto three lines while the right
 * half of the row sat empty. The fix is not a wider column — it is not having
 * a column. The name and the value sit at opposite ends of ONE line and neither
 * is measured against the other; the sentence runs the full width beneath.
 *
 * `DescriptionList` is the neighbour to compare against and is deliberately not
 * the home for this — see the docblock on the component for why.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test('the name and the value share one line, and the value is never squeezed', () => {
  const markup = html(<SettingRow name="Run budget" value="60m" description="Wall clock before the reaper stops a run." />);
  const line = /<div class="(flex[^"]*)">/.exec(markup)?.[1] ?? '';
  assert.match(line, /items-baseline/, 'one baseline, not one column');
  assert.match(line, /justify-between/, 'opposite ends of the line');
  // shrink-0 on the value is the whole fix: a short badge keeps its width and
  // the row wraps instead of folding it.
  assert.match(markup, /class="shrink-0 text-sm/);
  assert.match(line, /flex-wrap/, 'and it wraps rather than crushing');
});

test('the explanation is full width, beneath, and quieter', () => {
  const markup = html(<SettingRow name="Run budget" value="60m" description="Wall clock before the reaper stops a run." />);
  // A <p> after the pair, at the row's own width — no column, no max-width.
  assert.match(markup, /<p class="mt-1 text-xs leading-relaxed text-gray-500">Wall clock before the reaper stops a run\.<\/p>/);
  assert.doesNotMatch(markup, /max-w-/);
});

test('a value that is a control is labelled by the name', () => {
  const markup = html(
    <SettingRow
      name="Auto-approve"
      controlId="auto"
      value={<Switch id="auto" checked onChange={() => {}} />}
      description="Approves a run that changes no code."
    />,
  );
  assert.match(markup, /<label for="auto"[^>]*>Auto-approve<\/label>/);
  assert.match(markup, /role="switch"/);
});

test('a read-only row has no label pointing at nothing', () => {
  // A <label for> with no control is worse than no label: it promises a target
  // and moves focus nowhere.
  const markup = html(<SettingRow name="Runtime" value="claude-agent-sdk 0.4.2" />);
  assert.doesNotMatch(markup, /<label/);
  assert.match(markup, />Runtime</);
});

test('a value nobody knows is an em dash in the faint ink, not an empty cell', () => {
  for (const value of [null, undefined, '']) {
    const markup = html(<SettingRow name="Last run" value={value} />);
    assert.match(markup, /class="shrink-0 text-sm text-gray-400">—</, String(value));
  }
  // And a falsy value that IS an answer is left alone, the way DescriptionList
  // treats one: reporting "0" as "we do not know" is a different, worse claim.
  assert.match(html(<SettingRow name="Failures" value={0} />), />0</);
});

test('a quiet row is dimmed by ink, never by opacity', () => {
  // Opacity multiplies against whatever is behind the row, so a measured
  // contrast stops being measured the moment the row is hovered.
  const markup = html(<SettingRow name="Parallel runs" value="4" quiet description="Not yet writable." />);
  assert.doesNotMatch(markup, /opacity/);
  assert.match(markup, /text-sm font-medium text-gray-500">Parallel runs/);
  assert.match(markup, /class="shrink-0 text-sm text-gray-500">4</);
  // Not disabled: there is no control here to disable.
  assert.doesNotMatch(markup, /aria-disabled|disabled=/);
});

test('a badge in the value slot stays on one line', () => {
  // The original defect, as a row: a status pill is short, and nothing about
  // this layout can make it fold.
  const markup = html(
    <StatusBadgeProvider groups={{ degraded: 'warning' }}>
      <SettingRow name="Sandbox" value={<StatusBadge status="degraded" />} description="Loopback is blocked by default." />
    </StatusBadgeProvider>,
  );
  assert.match(markup, /<span class="shrink-0 text-sm[^"]*"><span class="inline-flex items-center rounded-full/);
});
