/**
 * Capture a hero screenshot of the deployed demo.
 *
 * Local:
 *   npx playwright install chromium     # one-time
 *   node scripts/screenshot.mjs
 *
 * CI: triggered by .github/workflows/screenshot.yml (workflow_dispatch).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.env.SCREENSHOT_URL || 'https://victorymau.github.io/react-os-shell/';
const OUT = process.env.SCREENSHOT_OUT || 'docs/hero.png';
const VIEWPORT_WIDTH = parseInt(process.env.SCREENSHOT_WIDTH || '1440', 10);
const VIEWPORT_HEIGHT = parseInt(process.env.SCREENSHOT_HEIGHT || '900', 10);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle' });

// Sign-in splash → desktop.
await page.getByRole('button', { name: /Continue as Demo User/i }).click();

// Wait for the startup splash to fade out and the taskbar to appear.
await page.waitForSelector('[data-menu-toggle]', { timeout: 15000 });

// Dismiss the "Click here to start" balloon so it's not in the shot.
await page.evaluate(() => {
  document.querySelectorAll('.animate-bounce button').forEach((b) => b.click());
});

// Let the wallpaper, default widgets (Weather + Currency), and animations settle.
await page.waitForTimeout(2500);

mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
console.log(`✓ Saved ${OUT}`);

await browser.close();
