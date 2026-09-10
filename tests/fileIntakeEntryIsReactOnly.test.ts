import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * `react-os-shell/file-intake` promises the upload intake with React and
 * nothing else in its graph — no react-dom, no stylesheet, no toast, no window
 * manager. Its consumers are the pages that cannot load the shell at all: the
 * admin portal's public applicant page (an architecture test there bans every
 * other `react-os-shell` import) and the public storefront.
 *
 * `useFileIntake.tsx` imports only React today. The edge that would break the
 * promise is one convenient import — a `toast` for a rejection, an icon for the
 * zone — and it would look like housekeeping in review. This walks the source
 * graph; `scripts/verify-dist.mjs` makes the same assertion against the built
 * output, the half that sees what a shared chunk carries.
 */

const ROOT = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
const ENTRY = join(ROOT, 'src/file-intake/index.ts');

/** React only. Not react-dom: the hook renders nothing through a portal. */
const ALLOWED_BARE = new Set(['react', 'react/jsx-runtime']);

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = join(dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every module specifier in an import/export-from position, plus dynamic imports. */
function specifiersOf(src: string): string[] {
  const out: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+[^;'"]*from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+[^;'"]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.push(m[1]);
  }
  return out;
}

test('nothing reachable from src/file-intake/index.ts imports anything but React', () => {
  const seen = new Set<string>();
  const offences: string[] = [];
  const queue = [ENTRY];

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const spec of specifiersOf(readFileSync(file, 'utf-8'))) {
      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec);
        if (!target) offences.push(`${file.slice(ROOT.length + 1)} imports '${spec}', which does not resolve`);
        else if (/\.css$/.test(target)) offences.push(`${file.slice(ROOT.length + 1)} imports the stylesheet '${spec}'`);
        else queue.push(target);
        continue;
      }
      if (ALLOWED_BARE.has(spec)) continue;
      offences.push(`${file.slice(ROOT.length + 1)} imports '${spec}'`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    'react-os-shell/file-intake must import nothing but react. Offending imports:\n  ' +
      offences.join('\n  ') +
      '\nKeep the intake a leaf: announce through FileIntakeAlert, never a toast.',
  );

  // The entry plus the hook module. A graph that collapsed to one file would
  // mean the entry stopped re-exporting the hook, and would pass vacuously.
  assert.ok(seen.size >= 2, `expected the entry and the hook module, walked only ${seen.size}`);
});
