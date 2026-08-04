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
const focusedConfirmSpec = join(testsDir, 'windowDirty.test.tsx');
const regularSpecs = specs.filter(spec => spec !== focusedConfirmSpec);

if (specs.length === 0) {
  console.error('No specs found in tests/');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

const sharedBuild = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  sourcemap: 'inline',
  logLevel: 'warning',
  // jsdom is external because it is a large node-only package that has no
  // business being bundled; react-dom/client and react-dom/test-utils are
  // listed so `tests/dom.ts` can pull them in dynamically, after it has put
  // the DOM globals in place (see the note in that file).
  external: [
    'react', 'react-dom', 'react-dom/server', 'react-dom/client',
    'react-dom/test-utils', 'react/jsx-runtime', 'jsdom',
  ],
  define: { __PKG_VERSION__: '"test"' },
};

await build({
  ...sharedBuild,
  entryPoints: regularSpecs,
  outdir: outDir,
});

const focusedOutDir = join(outDir, 'focused-confirm');
await build({
  ...sharedBuild,
  entryPoints: [focusedConfirmSpec],
  outdir: focusedOutDir,
  plugins: [{
    name: 'confirm-dialog-headlessui-test-double',
    setup(build) {
      build.onResolve({ filter: /^@headlessui\/react$/ }, (args) => {
        if (!args.importer.endsWith('/src/shell/ConfirmDialog.tsx')) return null;
        // This focused jsdom spec uses a visual double because Headless UI's
        // portal/transition layer depends on browser layout and CSS animation
        // APIs jsdom deliberately does not implement. All other specs resolve
        // real Headless UI, and the browser suite covers this boundary without
        // a double.
        return { path: join(root, 'tests', 'headlessui.tsx') };
      });
    },
  }],
});

// Specs run from the bundle, so `import.meta.url` points into the cache dir —
// anything that wants to read a repo file gets the root from here instead.
const bundled = readdirSync(outDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => join(outDir, f));
bundled.push(join(focusedOutDir, 'windowDirty.test.js'));

const child = spawn(process.execPath, ['--test', ...bundled], {
  stdio: 'inherit',
  env: { ...process.env, REPO_ROOT: root },
});
child.on('exit', (code) => process.exit(code ?? 1));
