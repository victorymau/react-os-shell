/**
 * Layout's `branding` prop routes the product's identity into the two
 * full-screen covers, which until now hard-coded `/favicon.svg`: a consumer
 * could name the start-menu button but their logo never reached the splash.
 * Layout itself needs the whole provider stack to mount, so these specs pin
 * the covers' contract directly: `logo` reaches the `<img>`, `subtitle`
 * renders, and the defaults are byte-what-they-were for existing callers.
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import StartupAnimation from '../src/shell/StartupAnimation';
import LogoutAnimation from '../src/shell/LogoutAnimation';

test('StartupAnimation shows the branded logo, name and tagline', () => {
  const markup = renderToStaticMarkup(
    <StartupAnimation onComplete={() => {}} productName="EFFICIENT" subtitle="Regis Design" logo="/brand.svg" />,
  );
  assert.match(markup, /src="\/brand\.svg"/);
  assert.match(markup, />EFFICIENT</);
  assert.match(markup, />Regis Design</);
});

test('LogoutAnimation shows the branded logo and tagline', () => {
  const markup = renderToStaticMarkup(
    <LogoutAnimation onComplete={() => {}} subtitle="Regis Design" logo="/brand.svg" />,
  );
  assert.match(markup, /src="\/brand\.svg"/);
  assert.match(markup, />Regis Design</);
});

test('without branding, both covers render exactly the old defaults', () => {
  const startup = renderToStaticMarkup(<StartupAnimation onComplete={() => {}} />);
  assert.match(startup, /src="\/favicon\.svg"/);
  assert.match(startup, />react-os-shell</i);
  const logout = renderToStaticMarkup(<LogoutAnimation onComplete={() => {}} />);
  assert.match(logout, /src="\/favicon\.svg"/);
});
