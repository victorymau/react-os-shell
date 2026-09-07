/**
 * Post-build check on the published artifact.
 *
 * This replaced four hard-coded `test -f` lines in ci.yml. Those were fragile in
 * a specific way: they named `dist/index.js`, `dist/index.d.ts`,
 * `dist/apps/index.js` and `dist/styles.css`, so ADDING a subpath shipped it
 * unverified, and the omission looked like nothing at all. This walks the
 * `exports` map instead, so a new entry is covered the moment it is declared.
 *
 * The second check is the one that matters most, and it cannot be done at
 * source level. `react-os-shell/ui` promises the UI kit with no optional peer
 * in its graph. `tests/uiEntryIsPeerFree.test.ts` asserts that over `src/`, but
 * tsup runs with `splitting: true`, so both entries share chunks — and a chunk
 * pulled in for the root entry could carry a peer import into the ui entry's
 * graph without a single source file changing. Only the built output shows it.
 *
 * It matters for the consumers with the thinnest dependency lists. The till has
 * no `@heroicons/react` installed at all, and heroicons is declared an OPTIONAL
 * peer, so pnpm will not add it on their behalf. Leakage there is an
 * unresolvable import at build time, not a missing icon.
 *
 * Read-only, no dependencies, safe to run locally: `node scripts/verify-dist.mjs`
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const problems = [];
const note = (m) => problems.push(m);

// ── 1. Every target named in `exports` exists and is non-empty ──────────────
const targets = new Set();
for (const [subpath, value] of Object.entries(pkg.exports ?? {})) {
  const paths = typeof value === 'string' ? [value] : Object.values(value);
  // Tab, not a space (a repo path may contain one) and not NUL, which makes
  // git call this whole file binary and refuse to diff it — on the one script
  // whose changes most need reading.
  for (const p of paths) targets.add(`${subpath}\t${p}`);
}
for (const entry of targets) {
  const [subpath, rel] = entry.split('\t');
  const abs = join(root, rel);
  if (!existsSync(abs)) note(`exports["${subpath}"] -> ${rel} does not exist`);
  else if (statSync(abs).size === 0) note(`exports["${subpath}"] -> ${rel} is empty`);
}

// ── 2. Each entry reaches only the packages it is allowed to ────────────────
const ALLOWED_BARE = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server']);
/** The markdown entry's peers, on top of React. Nothing else may join them. */
const MARKDOWN_PEERS = ['react-markdown', 'remark-gfm', 'remark-breaks'];
const UI_ENTRY = join(root, 'dist/ui/index.js');
const MARKDOWN_ENTRY = join(root, 'dist/markdown/index.js');

const STATIC_IMPORT_RES = [
  /(?:^|\n)\s*import\s+[^;'"]*from\s*['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*export\s+[^;'"]*from\s*['"]([^'"]+)['"]/g,
];
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** `dynamic: false` reports only what the module pulls in EAGERLY — what a host
 *  pays for at startup, as opposed to what a lazy chunk fetches on demand. */
function specifiersOf(src, { dynamic = true } = {}) {
  const out = [];
  for (const re of dynamic ? [...STATIC_IMPORT_RES, DYNAMIC_IMPORT_RE] : STATIC_IMPORT_RES) {
    let m;
    while ((m = re.exec(src))) out.push(m[1]);
  }
  return out;
}

/** Walk an entry's built graph, returning every file in it. With `allowed`,
 *  also report any bare import outside that set; pass null to only collect. */
function walkEntry(entry, allowed, why, opts) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(readFileSync(file, 'utf8'), opts)) {
      if (spec.startsWith('.')) {
        const target = join(dirname(file), spec);
        if (existsSync(target)) queue.push(target);
        else note(`${file.slice(root.length + 1)} imports '${spec}', which does not resolve`);
      } else if (allowed && !allowed.has(spec)) {
        note(`PEER LEAK: ${file.slice(root.length + 1)} imports '${spec}'. ${why}`);
      }
    }
  }
  return seen;
}

if (!existsSync(UI_ENTRY)) {
  note('dist/ui/index.js does not exist — did tsup lose the src/ui entry?');
} else {
  const seen = walkEntry(
    UI_ENTRY,
    ALLOWED_BARE,
    'react-os-shell/ui must reach nothing but react and react-dom — a ' +
      'consumer may not have that package installed at all.',
  );
  if (seen.size < 2) note(`the ui entry graph is only ${seen.size} file(s); expected chunks`);
}

// The markdown entry is allowed its parser and nothing more. It is the only
// module in the package with a third-party runtime, and the arrangement that
// makes that acceptable — an OPTIONAL peer, resolved only by a consumer who
// imports this subpath — holds exactly as long as the entry stays this small.
// A stray icon import here would make @heroicons/react a hard requirement of
// reading a bug report.
if (!existsSync(MARKDOWN_ENTRY)) {
  note('dist/markdown/index.js does not exist — did tsup lose the src/markdown entry?');
} else {
  walkEntry(
    MARKDOWN_ENTRY,
    new Set([...ALLOWED_BARE, ...MARKDOWN_PEERS]),
    'react-os-shell/markdown may reach react and its markdown peers only.',
  );
}

// ── 2b. …and the parser must not leak the OTHER way ─────────────────────────
//
// react-markdown reaching the root or the ui entry would quietly promote an
// optional peer to a required one: every consumer of `react-os-shell` would
// have to install a CommonMark parser to render a button. The import that does
// it is one line in a barrel and looks like housekeeping in review.
for (const [rel, label] of [['dist/index.js', 'react-os-shell'], ['dist/ui/index.js', 'react-os-shell/ui']]) {
  const entry = join(root, rel);
  if (!existsSync(entry)) continue;
  const graph = walkEntry(entry, null);
  for (const file of graph) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      // Prefix match, not equality: a deep import ('react-markdown/lib/…')
      // promotes the peer exactly as hard as the bare one does.
      if (MARKDOWN_PEERS.some(p => spec === p || spec.startsWith(`${p}/`))) {
        note(
          `PARSER LEAK: ${file.slice(root.length + 1)} imports '${spec}', which is ` +
            `reachable from ${label}. It belongs to react-os-shell/markdown alone — ` +
            'anywhere else it turns an optional peer into a required install.',
        );
      }
    }
  }
}

// ── 2c. The heavy optional peers stay behind a dynamic import ──────────────
//
// `react-os-shell/apps` is imported at startup by every host that composes the
// bundled window registry, and `PdfViewer`'s static `pdfjs-dist` import is a
// whole PDF parser — paid for before anyone has opened a document. What keeps
// it out is that every app here is reached through `lazy(() => import(...))`,
// and one plausible-looking `export { default as PdfViewer } from './PdfViewer'`
// in the barrel would undo it: typecheck clean, tests green, nothing to see but
// a slower first paint on five portals.
//
// Walking STATIC edges only is the whole point — the dynamic-import chunk that
// holds pdfjs is exactly where it belongs, and a walk that follows both kinds
// of edge cannot tell the two apart.
const LAZY_ONLY_PEERS = ['pdfjs-dist', 'dxf-viewer', 'online-3d-viewer', 'xlsx', 'mammoth'];
for (const rel of ['dist/index.js', 'dist/apps/index.js', 'dist/ui/index.js']) {
  const entry = join(root, rel);
  if (!existsSync(entry)) continue;
  for (const file of walkEntry(entry, null, null, { dynamic: false })) {
    for (const spec of specifiersOf(readFileSync(file, 'utf8'), { dynamic: false })) {
      const peer = LAZY_ONLY_PEERS.find(p => spec === p || spec.startsWith(`${p}/`));
      if (peer) {
        note(
          `EAGER PEER: ${file.slice(root.length + 1)} imports '${spec}' statically and is ` +
            `reachable from ${rel} without passing through a dynamic import. ${peer} must ` +
            'stay inside a lazy chunk — it is an OPTIONAL peer, so for a consumer that has ' +
            'not installed it this is an unresolvable import at build time, not a slow load.',
        );
      }
    }
  }
}

// ── 3. The root entry is a superset of the kit, sharing one module instance ─
//
// This is the check that caught the bug it exists for. `src/index.ts` re-exports
// the kit with `export * from`, and esbuild does NOT expand that when the target
// module is also an entry point — so the built root barrel silently shipped
// WITHOUT all 91 kit exports, the package's whole public surface, while the
// typecheck was clean and every source-level test passed. Nothing but loading
// the artifact reveals it.
//
// The identity half matters just as much: two copies of `toast` would each own
// their own DOM container and listener set, so an app importing from both
// entries would lose half its toasts with nothing erroring.
if (existsSync(UI_ENTRY) && existsSync(join(root, 'dist/index.js'))) {
  const [rootMod, uiMod] = await Promise.all([
    import(new URL('../dist/index.js', import.meta.url)),
    import(new URL('../dist/ui/index.js', import.meta.url)),
  ]);
  const missing = Object.keys(uiMod).filter(n => !(n in rootMod));
  if (missing.length) {
    note(
      `the root entry is missing ${missing.length} kit export(s): ${missing.slice(0, 12).join(', ')}` +
        `${missing.length > 12 ? ', …' : ''}. react-os-shell must stay a superset of ` +
        'react-os-shell/ui — check that src/index.ts stars a NON-entry module.',
    );
  }
  const forked = Object.keys(uiMod).filter(n => n in rootMod && rootMod[n] !== uiMod[n]);
  if (forked.length) {
    note(
      `these are DIFFERENT bindings on the two entries: ${forked.join(', ')}. ` +
        'The entries must share one module instance, or singletons like toast ' +
        'are duplicated for anyone importing from both.',
    );
  }
}

// ── 4. ui.css carries what Tailwind needs, and not what it must not ─────────
const uiCss = join(root, 'dist/ui.css');
if (existsSync(uiCss)) {
  const css = readFileSync(uiCss, 'utf8');
  if (!/^\s*@source\s+/m.test(css)) {
    note('dist/ui.css has no @source — every utility the kit uses would vanish');
  }
  if (/^\s*@import\s+"tailwindcss"/m.test(css)) {
    note('dist/ui.css imports tailwindcss; the consumer must control preflight');
  }
}

if (problems.length) {
  console.error('Build artifacts are not publishable:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Build artifacts present.');
