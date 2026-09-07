import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Switch from '../src/forms/Switch';

/**
 * A dead toggle with no explanation.
 *
 * `Button` has carried `disabledReason` for exactly this, and its docblock says
 * why the reason is sibling TEXT wired with `aria-describedby` rather than a
 * `title`: a tooltip needs a hover, and a disabled control is not reliably
 * hovered. `Switch` had no such prop, so an operator console explaining that
 * eight settings are read-only until a capability ships had two options —
 * repeat one sentence eight times, or say nothing. It repeated the sentence.
 *
 * So there are two contracts here, not one. A control with a reason of its own
 * prints it. A panel of controls that share ONE reason points at it, and prints
 * nothing — which is the case that made the prop worth adding.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const describedBy = (markup: string) => /aria-describedby="([^"]*)"/.exec(markup)?.[1];

test('a disabled switch says why, beside it, and points at what it said', () => {
  const markup = html(
    <Switch checked={false} onChange={() => {}} disabled label="Auto-approve" disabledReason="Needs an approver role." />,
  );
  assert.match(markup, />Needs an approver role\.</);
  const ids = describedBy(markup);
  assert.ok(ids, 'the reason is not announced with the control');
  assert.match(markup, new RegExp(`id="${ids}"[^>]*>Needs an approver role\\.`));
  // Never a tooltip: the whole point of the shape.
  assert.doesNotMatch(markup, /title="Needs an approver role/);
});

test('an enabled switch ignores it entirely', () => {
  // So a caller can pass it unconditionally, exactly as Button allows.
  const markup = html(
    <Switch checked onChange={() => {}} label="Auto-approve" disabledReason="Needs an approver role." />,
  );
  assert.doesNotMatch(markup, /Needs an approver role/);
});

test('with nothing else beside it, the bare control is unchanged', () => {
  // The compatibility claim: every release before this prop existed rendered
  // exactly this markup, and an unused prop must not add a wrapper.
  const before = html(<Switch checked={false} onChange={() => {}} />);
  const after = html(<Switch checked={false} onChange={() => {}} disabledReason="Not while syncing." />);
  assert.equal(after, before);
  assert.doesNotMatch(after, /aria-describedby/);
});

test('many controls can share one explanation instead of repeating it', () => {
  // The console case. One sentence above the panel, eight switches pointing at
  // it, and the sentence appears once on the screen and once per control in the
  // accessibility tree — which is what "shared" has to mean for both readers.
  const panel = html(
    <div>
      <p id="why-readonly">These settings are read-only until the agent runtime ships.</p>
      {['Auto-approve', 'Retry on failure', 'Stream logs'].map((label) => (
        <Switch key={label} checked={false} onChange={() => {}} disabled label={label} disabledReasonId="why-readonly" />
      ))}
    </div>,
  );
  assert.equal([...panel.matchAll(/read-only until the agent runtime ships/g)].length, 1, 'the sentence is printed once');
  assert.equal([...panel.matchAll(/aria-describedby="why-readonly"/g)].length, 3, 'every control points at it');
});

test('a shared explanation wins over a private one', () => {
  // Two answers to one question, and the shared one is why the prop exists.
  // Printing both would put the panel's sentence under one control as well.
  const markup = html(
    <Switch
      checked={false}
      onChange={() => {}}
      disabled
      label="Auto-approve"
      disabledReason="Needs an approver role."
      disabledReasonId="why-readonly"
    />,
  );
  assert.equal(describedBy(markup), 'why-readonly');
  assert.doesNotMatch(markup, /Needs an approver role/);
});

test('a shared explanation is ignored while the switch is live', () => {
  const markup = html(
    <Switch checked onChange={() => {}} label="Auto-approve" disabledReasonId="why-readonly" />,
  );
  assert.doesNotMatch(markup, /why-readonly/);
});

test('the hint survives — a reason describes as well as, not instead of', () => {
  // aria-describedby takes a list. Replacing the hint would trade "what this
  // setting does" for "why you cannot touch it", and a reader needs both.
  const markup = html(
    <Switch
      checked={false}
      onChange={() => {}}
      disabled
      id="auto"
      label="Auto-approve"
      hint="Approves a run that changes no code."
      disabledReason="Needs an approver role."
    />,
  );
  assert.equal(describedBy(markup), 'auto-hint auto-reason');
  assert.match(markup, /id="auto-hint"/);
  assert.match(markup, /id="auto-reason"/);
});
