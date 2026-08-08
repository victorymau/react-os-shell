import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Kanban from '../src/data/Kanban';
import type { KanbanColumn } from '../src/data/Kanban';

/**
 * The regression: an empty board rendered `emptyState` INSTEAD of the columns,
 * so a board whose columns are configurable (the admin portal's deal pipelines)
 * could not show the shape the user had just defined — no headers, and no drop
 * target to put a first card into. `showColumnsWhenEmpty` draws the board
 * anyway; the default has to stay exactly as it was, because every other caller
 * relies on it. These specs pin both halves.
 */

interface Card {
  id: string;
  stage: string;
}

const columns: KanbanColumn[] = [
  { value: 'new', label: 'New' },
  { value: 'won', label: 'Won' },
];

const board = (items: Card[], extra: { showColumnsWhenEmpty?: boolean; emptyState?: string } = {}) =>
  renderToStaticMarkup(
    <Kanban<Card>
      items={items}
      columns={columns}
      columnOf={c => c.stage}
      getId={c => c.id}
      onMove={() => {}}
      renderCard={c => <span>{c.id}</span>}
      columnEmptyText="Drop deals here"
      {...extra}
    />,
  );

test('an empty board still renders emptyState by default', () => {
  const html = board([], { emptyState: 'No deals in Sales yet.' });
  assert.match(html, /No deals in Sales yet\./);
  assert.doesNotMatch(html, />New</, 'the columns must stay hidden for existing callers');
  assert.doesNotMatch(html, /Drop deals here/);
});

test('an empty board with no emptyState still falls back to the stock message', () => {
  assert.match(board([]), /No items\./);
});

test('showColumnsWhenEmpty draws the columns and their placeholders instead', () => {
  const html = board([], { showColumnsWhenEmpty: true, emptyState: 'No deals in Sales yet.' });
  assert.match(html, />New</);
  assert.match(html, />Won</);
  // One placeholder per column — each is a drop target for the board's first card.
  assert.equal(html.match(/Drop deals here/g)?.length, 2);
  // `emptyState` is not ALSO rendered — it is the branch that was replaced.
  assert.doesNotMatch(html, /No deals in Sales yet\./);
});

test('every column reports a zero count when the board is empty', () => {
  const html = board([], { showColumnsWhenEmpty: true });
  assert.equal(html.match(/opacity-70">0</g)?.length, 2);
});

test('showColumnsWhenEmpty changes nothing once the board has items', () => {
  const items: Card[] = [{ id: 'd1', stage: 'new' }];
  assert.equal(board(items, { showColumnsWhenEmpty: true }), board(items));
});
