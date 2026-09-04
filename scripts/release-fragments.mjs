/**
 * Assemble pending release fragments into a versioned release.
 *
 * Replaces the hand-bumped `package.json` + `CHANGELOG.md` convention. Under
 * that convention the next version number was shared mutable state that every
 * open branch wrote to, and git auto-merged the collision silently: two
 * branches both writing `"version": "4.93.0"` merge without a conflict and
 * both pull-request runs stay green, because a green check proves the merge
 * ref that existed when it ran, not the main that exists at merge time. On
 * 2026-09-04 four open pull requests claimed 4.93.0 at once, and every one of
 * the 28 pairs among the nine open branches conflicted — on `CHANGELOG.md`,
 * `package.json` and `package-lock.json` and on nothing else. Two branches
 * rewriting the same 200-line hook merged clean; the release files were the
 * only contention in the repository.
 *
 * So each pull request now adds one uniquely-named fragment under `.changes/`
 * (see `.changes/README.md`) and THIS script — run by the serialised
 * main-branch job in `.github/workflows/release-assemble.yml`, never by hand
 * on a branch — assigns the version at merge time:
 *
 *   * next version = current `package.json` version + the highest `bump:`
 *     among the pending fragments (one release per run, so merges that race
 *     batch into a single version rather than burning one each);
 *   * prepends one `## X.Y.Z` section to `CHANGELOG.md`, built from the
 *     fragment bodies verbatim;
 *   * writes the version into `package.json` and `package-lock.json`;
 *   * deletes the consumed fragments.
 *
 * The bodies are carried through VERBATIM rather than flattened into a list of
 * strings. This changelog's entries are prose — nested paragraphs, code spans,
 * an argument for why a default moved — and that is the format a consumer
 * reads on npm. A fragment is therefore written as the changelog section it
 * will become, and the assembler only decides which number sits above it.
 *
 * Pure file transform: no git, and NO side effect on import — the command
 * line lives in `assemble-release.mjs` next door. A `main`-guard here would
 * be a trap: the spec is bundled by esbuild before it runs, and inside a
 * bundle `import.meta.url` and `process.argv[1]` are the same path, so the
 * guard passes and the module releases the repository on import.
 *
 * The workflow step owns commit/push/retry, so this stays runnable locally
 * for a dry run. Exported for `tests/releaseFragments.test.ts`.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const CHANGES_DIR = '.changes';
export const PACKAGE_JSON = 'package.json';
export const PACKAGE_LOCK = 'package-lock.json';
export const CHANGELOG_MD = 'CHANGELOG.md';
export const PACKAGE_NAME = 'react-os-shell';

const BUMP_LEVELS = ['major', 'minor', 'patch'];
const ALLOWED_KEYS = ['bump', 'title'];

export class FragmentError extends Error {}

/**
 * Strict frontmatter parse — a typo must fail the pull-request guard, not the
 * merge-time job, because by then the branch that wrote it is gone.
 */
export function parseFragment(text, name) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new FragmentError(`${name}: missing \`---\` frontmatter block`);
  const [, header, body] = match;
  const keys = {};
  for (const line of header.split('\n')) {
    if (!line.trim()) continue;
    const sep = line.indexOf(':');
    const key = sep === -1 ? '' : line.slice(0, sep).trim();
    if (!ALLOWED_KEYS.includes(key)) {
      throw new FragmentError(
        `${name}: bad frontmatter line ${JSON.stringify(line)} (allowed keys: ${ALLOWED_KEYS.join(', ')})`,
      );
    }
    keys[key] = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  if (!BUMP_LEVELS.includes(keys.bump)) {
    throw new FragmentError(
      `${name}: \`bump:\` must be one of ${BUMP_LEVELS.join('|')}, got ${JSON.stringify(keys.bump ?? '')}`,
    );
  }
  if (!keys.title) throw new FragmentError(`${name}: \`title:\` is required`);
  const notes = body.trim();
  if (!notes) throw new FragmentError(`${name}: changelog prose below the frontmatter is required`);
  // A fragment body becomes a changelog section verbatim, so it must not carry
  // its own heading — the assembler owns the `## X.Y.Z` line, and a second one
  // inside the body would split the release in the rendered file.
  if (/^##\s/m.test(notes)) {
    throw new FragmentError(
      `${name}: the body must not contain a \`## \` heading — the release number is stamped at merge time`,
    );
  }
  return { name, bump: keys.bump, title: keys.title, notes };
}

export function pendingFragments(dir = CHANGES_DIR) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter(n => n.endsWith('.md') && n !== 'README.md')
    .sort()
    .map(n => parseFragment(readFileSync(path.join(dir, n), 'utf8'), path.join(dir, n)));
}

/**
 * The highest version the registry already serves, or null when it cannot be
 * asked.
 *
 * Null on any failure — an unreachable registry must not hold up a release.
 * It only lowers the floor back to package.json, which is where it was before
 * this function existed.
 *
 * @param {string} [name]
 * @param {(name: string) => string | null} [run]
 * @returns {string | null}
 */
export function publishedVersion(name = PACKAGE_NAME, run = npmViewVersion) {
  const version = run(name);
  return /^\d+\.\d+\.\d+$/.test(version ?? '') ? version : null;
}

function npmViewVersion(name) {
  try {
    return execFileSync('npm', ['view', name, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    }).trim();
  } catch {
    return null;
  }
}

/** a.b.c ordering, -1 / 0 / 1. */
function compare(a, b) {
  const [x, y] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/**
 * @param {string} current
 * @param {string[]} bumps
 * @param {string | null} [published] the registry's latest, when it could be asked
 */
export function nextVersion(current, bumps, published = null) {
  if (!/^\d+\.\d+\.\d+$/.test(current)) {
    throw new FragmentError(`current version ${JSON.stringify(current)} is not plain MAJOR.MINOR.PATCH`);
  }
  // The floor is whichever is higher, package.json or the registry. They agree
  // on every ordinary release; they disagreed on 2026-09-04, when 4.93.0 was
  // published by hand from an older tree while this file still said 4.92.0 —
  // and the assembler then handed the SAME number to nine commits the
  // registry's 4.93.0 does not contain. A number the registry has spent is
  // spent whatever this file thinks, and `npm publish` is where that would
  // otherwise surface: after the tag, at the last step.
  const floor = published && compare(published, current) > 0 ? published : current;
  const [major, minor, patch] = floor.split('.').map(Number);
  // One release per run: merges that race batch under the highest bump asked
  // for, which is why no branch ever has to guess at a number.
  if (bumps.includes('major')) return `${major + 1}.0.0`;
  if (bumps.includes('minor')) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function readCurrentVersion(packageJson = PACKAGE_JSON) {
  const version = JSON.parse(readFileSync(packageJson, 'utf8')).version;
  if (typeof version !== 'string') throw new FragmentError(`${packageJson}: no \`version\` field`);
  return version;
}

/**
 * One `## X.Y.Z` section, fragment bodies in filename order.
 *
 * Filename order and not merge order: it is the only ordering both a local dry
 * run and the workflow can agree on, since the workflow consumes whatever is
 * pending rather than replaying a merge sequence.
 */
export function renderSection(version, fragments) {
  return `## ${version}\n\n${fragments.map(f => f.notes).join('\n\n')}\n`;
}

/**
 * Prepend the section above the newest existing one.
 *
 * Anchored on the first `## ` rather than on a line number, so the Keep a
 * Changelog preamble can grow without moving the insertion point. A changelog
 * with no sections yet appends after the preamble.
 */
export function prependSection(section, changelogMd = CHANGELOG_MD) {
  const text = readFileSync(changelogMd, 'utf8');
  const at = text.search(/^## /m);
  if (at === -1) return writeFileSync(changelogMd, `${text.trimEnd()}\n\n${section}`);
  writeFileSync(changelogMd, `${text.slice(0, at)}${section}\n${text.slice(at)}`);
}

/**
 * Write the version into both manifests.
 *
 * `package-lock.json` carries it twice — the root and the `""` self-entry —
 * and npm rewrites both. A round trip through `JSON.parse`/`stringify` at two
 * spaces reproduces npm's own formatting byte for byte, so the release commit
 * shows two changed lines rather than a reformatted lockfile.
 */
export function writeVersion(version, packageJson = PACKAGE_JSON, packageLock = PACKAGE_LOCK) {
  const pkg = JSON.parse(readFileSync(packageJson, 'utf8'));
  pkg.version = version;
  writeFileSync(packageJson, `${JSON.stringify(pkg, null, 2)}\n`);

  const lock = JSON.parse(readFileSync(packageLock, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeFileSync(packageLock, `${JSON.stringify(lock, null, 2)}\n`);
}

export function assemble() {
  const fragments = pendingFragments();
  if (!fragments.length) throw new FragmentError('no pending fragments under .changes/ — nothing to assemble');
  const current = readCurrentVersion();
  const published = publishedVersion();
  const version = nextVersion(current, fragments.map(f => f.bump), published);
  prependSection(renderSection(version, fragments));
  writeVersion(version);
  for (const f of fragments) unlinkSync(f.name);
  console.error(
    `${current} -> ${version} (${fragments.length} fragment(s): ${fragments.map(f => path.basename(f.name)).join(', ')})`,
  );
  if (published && compare(published, current) > 0) {
    console.error(`  registry is ahead at ${published}; ${current} + bump would have collided`);
  }
  return version;
}
