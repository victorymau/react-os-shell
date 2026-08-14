import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Text, Title, Paragraph } from '../src/shell/Text';
import { Stack, Inline, Grid } from '../src/shell/Stack';
import Skeleton from '../src/shell/Skeleton';
import DescriptionList from '../src/shell/DescriptionList';
import Result from '../src/shell/Result';
import Divider from '../src/shell/Divider';
import CountBadge from '../src/shell/CountBadge';
import Statistic from '../src/shell/Statistic';
import Segmented from '../src/forms/Segmented';
import Switch from '../src/forms/Switch';

/**
 * The display set that lets the dealer portal leave Ant Design.
 *
 * These specs go after the failure modes that are invisible in review rather
 * than the rendering. Two recur across the whole set and are worth naming:
 *
 *  - An INTERPOLATED Tailwind class (`grid-cols-${n}`) generates no CSS at all.
 *    Nothing errors; the layout just collapses to one column and looks like a
 *    styling opinion rather than a bug. Every count-driven class here comes
 *    from a literal map, and these assert the literals actually appear.
 *  - A colour applied any way other than a utility CLASS is invisible to this
 *    package's dark-mode remaps, so it is correct in light and permanently
 *    wrong in dark. Tones assert their class, not their appearance.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test('Text tones resolve to remappable utility classes, never inline colour', () => {
  assert.match(html(<Text>x</Text>), /text-gray-900/);
  assert.match(html(<Text tone="secondary">x</Text>), /text-gray-500/);
  assert.match(html(<Text tone="danger">x</Text>), /text-red-600/);
  // `inherit` is the deliberate escape for text inside a coloured surface: it
  // must contribute NO colour class rather than a neutral one.
  assert.doesNotMatch(html(<Text tone="inherit">x</Text>), /text-gray|text-red/);
  assert.doesNotMatch(html(<Text tone="danger">x</Text>), /style=/);
});

test('a truncated Text keeps its full string reachable', () => {
  // Truncation removes information; the title attribute puts it back. This is
  // the one place a title is right — it restores text rather than hiding any.
  const out = html(<Text truncate>A very long part description</Text>);
  assert.match(out, /truncate/);
  assert.match(out, /title="A very long part description"/);
});

test('Title level drives the tag and the size together', () => {
  // Otherwise the document outline and the visual hierarchy drift apart, and
  // a page ends up with an h4 that looks like a page heading.
  assert.match(html(<Title level={1}>T</Title>), /^<h1[^>]*text-2xl/);
  assert.match(html(<Title level={3}>T</Title>), /^<h3[^>]*text-lg/);
  assert.match(html(<Title>T</Title>), /^<h2/);
});

test('Paragraph spaces stacked copy and drops the trailing margin', () => {
  assert.match(html(<Paragraph>p</Paragraph>), /mb-2 last:mb-0/);
});

test('layout gaps and column counts are literal classes, not interpolated', () => {
  // The bug this defends: `gap-${n}` and `grid-cols-${n}` compile to nothing.
  assert.match(html(<Stack gap={6}>c</Stack>), /(?:^|\s)gap-6/);
  assert.match(html(<Inline gap={2}>c</Inline>), /(?:^|\s)gap-2/);
  assert.match(html(<Grid cols={3}>c</Grid>), /(?:^|\s)grid-cols-3/);
  assert.match(html(<Grid cols={1} smCols={2} lgCols={4}>c</Grid>), /grid-cols-1.*sm:grid-cols-2.*lg:grid-cols-4/);
  assert.doesNotMatch(html(<Grid cols={3}>c</Grid>), /grid-cols-\$/);
});

test('Inline wraps by default — an unwrapped row is how a toolbar breaks', () => {
  assert.match(html(<Inline>c</Inline>), /flex-wrap/);
  assert.doesNotMatch(html(<Inline wrap={false}>c</Inline>), /flex-wrap/);
});

test('Skeleton sizes go through inline style, where arbitrary values work', () => {
  // `w-[213px]` produces NO style in the compiled stylesheet the design-sync
  // previews use, so a skeleton sized by class is invisible there.
  const out = html(<Skeleton width={213} height={20} />);
  assert.match(out, /style="width:213px;height:20px"/);
  assert.doesNotMatch(out, /w-\[/);
  assert.match(out, /animate-pulse/);
});

test('a multi-line Skeleton ends short, like prose does', () => {
  // Identical full-width bars read as a table, not a paragraph.
  const out = html(<Skeleton lines={3} />);
  assert.equal((out.match(/animate-pulse/g) ?? []).length, 3);
  assert.match(out, /width:60%/);
});

test('DescriptionList is a dl, and responsive columns emit every breakpoint', () => {
  const out = html(
    <DescriptionList
      columns={{ base: 1, sm: 2, lg: 3 }}
      items={[{ label: 'Carrier', value: 'DHL' }, { label: 'Notes', value: 'n/a', span: true }]}
    />,
  );
  assert.match(out, /<dl/);
  assert.match(out, /<dt/);
  assert.match(out, /<dd/);
  assert.match(out, /grid-cols-1/);
  assert.match(out, /sm:grid-cols-2/);
  assert.match(out, /lg:grid-cols-3/);
  // A spanning item must fill the row at the WIDEST breakpoint in play, or it
  // stops spanning exactly where the grid gets wide enough to need it.
  assert.match(out, /col-span-3/);
});

test('Result: a missing page is not coloured like an error the user caused', () => {
  assert.match(html(<Result status="404" />), /text-blue-600/);
  assert.match(html(<Result status="404" />), /Page not found/);
  assert.match(html(<Result status="500" />), /text-red-600/);
  assert.match(html(<Result status="403" />), /text-amber-600/);
  assert.match(html(<Result status="success" title="Order placed" />), /text-green-600/);
});

test('CountBadge hides zero unless asked, and caps at max', () => {
  // A badge reading "0" is noise that trains people to stop looking.
  assert.equal(html(<CountBadge count={0} />), '');
  assert.match(html(<CountBadge count={0} showZero />), />0</);
  assert.match(html(<CountBadge count={7} />), />7</);
  assert.match(html(<CountBadge count={250} max={99} />), />99\+</);
  assert.match(html(<CountBadge count={3}><span>Cart</span></CountBadge>), /Cart/);
});

test('Statistic aligns figures so a changing value does not twitch', () => {
  assert.match(html(<Statistic value={42} title="Orders" />), /tabular-nums/);
  assert.match(html(<Statistic value={1.5} precision={2} />), />1\.50</);
  assert.match(html(<Statistic value={5} tone="danger" />), /text-red-600/);
});

test('Divider carries a label without a background trick', () => {
  assert.match(html(<Divider />), /<hr/);
  assert.match(html(<Divider>OR</Divider>), /OR/);
  assert.match(html(<Divider orientation="vertical" />), /w-px/);
});

test('Segmented with a name is a real radio group, without one it is buttons', () => {
  // The distinction that decides whether a form actually submits the choice.
  const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
  const asRadios = html(<Segmented name="mode" value="a" onChange={() => {}} options={opts} />);
  assert.match(asRadios, /role="radiogroup"/);
  assert.match(asRadios, /type="radio"/);
  assert.match(asRadios, /name="mode"/);
  assert.match(asRadios, /sr-only/, 'the input stays in the tab order rather than being removed');

  const asButtons = html(<Segmented value="a" onChange={() => {}} options={opts} />);
  assert.doesNotMatch(asButtons, /type="radio"/);
  assert.match(asButtons, /aria-pressed="true"/);
});

test('Segmented options never wrap, and the track scrolls instead', () => {
  // A two-word option on a phone used to wrap to a second line while the pill
  // kept its fixed h-9, so the selected segment was shorter than its own text
  // and the track sat crooked around it. Scrolling is the right failure for a
  // segmented control: letting it grow pushes whatever is beside it off screen.
  const markup = html(
    <Segmented
      value="outstanding"
      onChange={() => {}}
      options={[{ value: 'outstanding', label: 'Outstanding Only' }, { value: 'full', label: 'Full Activities' }]}
    />,
  );
  assert.match(markup, /whitespace-nowrap/, 'an option is one line');
  assert.match(markup, /overflow-x-auto/, 'and the track takes the overflow');
  assert.match(markup, /max-w-full/, 'never wider than what contains it');
  assert.match(markup, /scrollbar-width:none/, 'and no scrollbar under it — the track rounds a pixel wide often enough that one would appear when nothing is clipped');
});

test('Switch is a real switch, not a styled checkbox', () => {
  const on = html(<Switch checked onChange={() => {}} />);
  assert.match(on, /role="switch"/);
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /bg-blue-600/);
  assert.match(html(<Switch checked={false} onChange={() => {}} />), /aria-checked="false"/);
});

test('Switch hint is wired to the control, not just placed near it', () => {
  const out = html(<Switch checked onChange={() => {}} label="Default address" hint="Used at checkout" />);
  assert.match(out, /aria-describedby="([^"]+)"/);
  const id = /aria-describedby="([^"]+)"/.exec(out)![1];
  assert.match(out, new RegExp(`id="${id}"[^>]*>Used at checkout`));
});
