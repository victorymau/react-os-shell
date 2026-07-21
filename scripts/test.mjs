/**
 * Test runner — `npm test`.
 *
 * The package ships no test FRAMEWORK on purpose: every dependency here is a
 * dependency CI installs on two Node versions for a library whose CI budget is
 * "typecheck + build". So the runner is assembled from small pieces — esbuild
 * transpiles the .tsx specs, node's built-in test runner runs them, and
 * react-dom/server renders the components to static markup.
 *
 * esbuild is a declared devDependency, NOT a borrowed one. It arrives in
 * `node_modules` as a tsup dependency either way, so the import resolves
 * without it — but only by npm's hoisting, which is a property of the install
 * topology and not a promise anyone made. This file is on the CI critical path,
 * so a change in tsup's dependency layout would break the build job with a
 * module-not-found rather than a test failure. Declaring it costs nothing (it
 * dedupes to the same single copy) and makes the resolution guaranteed.
 *
 * Specs live in `tests/*.test.tsx` and import components from `../src/...`.
 * React stays external so the specs and the components share one instance.
 * They are typechecked by `tsconfig.test.json`, NOT here: esbuild strips types
 * without checking them, so `npm test` passing says nothing about spec types.
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
