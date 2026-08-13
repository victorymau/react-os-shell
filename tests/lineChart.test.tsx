/**
 * The chart family stopped at Sparkline for trends — no axes, no series, fixed
 * pixel width — so any portal page showing orders-per-week had nothing to
 * reach for. LineChart is the missing piece: multi-series, container-filling,
 * optional scale/legend/dots/fill, still dependency-free `currentColor` SVG.
 *
 * The geometry contract these specs pin: the plot is a stretched 0–100
 * viewBox, so every stroke carries `vector-effect: non-scaling-stroke` (a
 * stretched stroke is otherwise thicker vertically than horizontally), and
 * dots are zero-length round-capped strokes (a stretched circle is an
 * ellipse).
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import LineChart from '../src/charts/LineChart';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test('draws one path per series, plus an area only where fill is given', () => {
  const markup = html(
    <LineChart series={[
      { data: [1, 2, 3], color: '#f00' },
      { data: [3, 2, 1], color: '#00f', fill: 'rgba(0,0,255,0.1)' },
    ]} />,
  );
  const lines = markup.match(/<path[^>]*fill="none"/g) ?? [];
  assert.equal(lines.length, 2);
  const areas = markup.match(/<path[^>]*stroke="none"/g) ?? [];
  assert.equal(areas.length, 1);
  assert.match(markup, /vector-effect="non-scaling-stroke"/);
});

test('scales across all series: shared min and max', () => {
  // Series A spans 0–10, series B 5–20 → bottom 0, top 20. A's max (10) sits
  // at the vertical middle: y = 50.
  const markup = html(
    <LineChart series={[{ data: [0, 10] }, { data: [5, 20] }]} />,
  );
  assert.match(markup, /L100.00,50.00/);
});

test('the scale gutter shows top, middle and bottom values', () => {
  const markup = html(<LineChart series={[{ data: [0, 40] }]} showScale />);
  assert.match(markup, />40</);
  assert.match(markup, />20</);
  assert.match(markup, />0</);
});

test('a single point draws a flat full-width line, as Sparkline does', () => {
  const markup = html(<LineChart series={[{ data: [7] }]} />);
  assert.match(markup, /M0.00,\d+\.\d+ L100.00/);
});

test('legend renders series labels with their colors', () => {
  const markup = html(
    <LineChart showLegend series={[{ data: [1, 2], label: 'Orders', color: '#0a0' }]} />,
  );
  assert.match(markup, /Orders/);
  assert.match(markup, /background-color:#0a0/);
});

test('dots are round-capped zero-length strokes carrying tooltips', () => {
  const markup = html(
    <LineChart showDots labels={['Mon', 'Tue']} series={[{ data: [1, 2], label: 'Orders' }]} />,
  );
  assert.match(markup, /h0\.01/);
  assert.match(markup, /<title>Mon: Orders 1<\/title>/);
});

test('empty series render nothing at all', () => {
  assert.equal(html(<LineChart series={[]} />), '');
  assert.equal(html(<LineChart series={[{ data: [] }]} />), '');
});
