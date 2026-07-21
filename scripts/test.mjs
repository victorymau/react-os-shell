/**
 * Test runner — `npm test`.
 *
 * The package ships no test framework on purpose: every dependency here is a
 * dependency CI installs on two Node versions for a library whose CI budget is
 * "typecheck + build". So the runner is assembled from what the repo already
 * has — esbuild (a tsup dependency) transpiles the .tsx specs, node's built-in
 * test runner runs them, and react-dom/server renders the components to static
 * markup. No new devDependency, no lockfile churn.
 *
 * Specs live in `tests/*.test.tsx` and import components from `../src/...`.
 * React stays external so the specs and the components share one instance.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(root, 'tests');
// Inside node_modules so `import 'react'` resolves by the normal upward walk
// (and so the output is gitignored without a new rule).
const outDir = join(root, 'node_modules', '.cache', 'react-os-shell-tests');

const specs = readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.tsx') || f.endsWith('.test.ts'))
  .map((f) => join(testsDir, f));

if (specs.length === 0) {
  console.error('No specs found in tests/');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints: specs,
  outdir: outDir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  sourcemap: 'inline',
  logLevel: 'warning',
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  define: { __PKG_VERSION__: '"test"' },
});

// Specs run from the bundle, so `import.meta.url` points into the cache dir —
// anything that wants to read a repo file gets the root from here instead.
const bundled = readdirSync(outDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => join(outDir, f));

const child = spawn(process.execPath, ['--test', ...bundled], {
  stdio: 'inherit',
  env: { ...process.env, REPO_ROOT: root },
});
child.on('exit', (code) => process.exit(code ?? 1));
