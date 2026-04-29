// Tiny per-user file server. Identity is a random user ID that the server
// assigns via an httpOnly cookie on first visit — clearing cookies means
// losing access, which is fine for the simple demo case (most production
// systems wrap this kind of thing in a real login flow). Each user gets a
// folder under ./data/{userId}/ and a quota cap measured in bytes; uploads
// that would exceed it are rejected with 413.

import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const TMP_DIR = path.join(__dirname, 'tmp');

for (const dir of [DATA_DIR, TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── config ───────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
// Per-user quota. 100 MB by default — bump via env. Display values use
// power-of-two units to match the human "100 MB" expectation.
const QUOTA_BYTES = Number(process.env.QUOTA_BYTES) || 100 * 1024 * 1024;
// Max single upload. Capped to the quota so we never accept a file we'd
// have to reject anyway.
const MAX_UPLOAD_BYTES = Math.min(
  Number(process.env.MAX_UPLOAD_BYTES) || QUOTA_BYTES,
  QUOTA_BYTES,
);
// Cookie lifetime: ~10 years.
const COOKIE_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const COOKIE_NAME = 'fs_uid';

// ── helpers ──────────────────────────────────────────────────────────────
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function newUserId() {
  // 16 bytes of url-safe base64 — fits in a cookie, plenty of entropy.
  return crypto.randomBytes(16).toString('base64url');
}

function safePath(userDir, requested) {
  const cleaned = String(requested || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const resolved = path.resolve(userDir, cleaned);
  if (resolved === userDir) return resolved;
  if (resolved.startsWith(userDir + path.sep)) return resolved;
  return null;
}

function relPath(userDir, abs) {
  return '/' + path.relative(userDir, abs).split(path.sep).join('/');
}

function dirUsageBytes(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile()) {
        try { total += fs.statSync(p).size; } catch {}
      }
    }
  }
  return total;
}

// ── app ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS: reflect the request origin so credentialed requests work cross-port
// during development. Lock this down for production deployments.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Cookie-based identity: assign a userId on first request and stick to it.
// SameSite=None + Secure is required for cross-origin fetches with
// `credentials: 'include'`. Browsers treat localhost as a secure context
// for the purposes of the Secure flag, so this works for local dev.
function identify(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let uid = cookies[COOKIE_NAME];
  if (!uid || !/^[A-Za-z0-9_-]{16,}$/.test(uid)) {
    uid = newUserId();
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${uid}; Path=/; Max-Age=${COOKIE_TTL_SECONDS}; HttpOnly; SameSite=None; Secure`,
    );
  }
  req.user = uid;
  req.userDir = path.join(DATA_DIR, uid);
  if (!fs.existsSync(req.userDir)) fs.mkdirSync(req.userDir, { recursive: true });
  next();
}

app.use(identify);

// ── routes ───────────────────────────────────────────────────────────────

// GET /api/me — sanity check; returns the user id + quota state.
app.get('/api/me', (req, res) => {
  const used = dirUsageBytes(req.userDir);
  res.json({ user: req.user, used, limit: QUOTA_BYTES });
});

// GET /api/quota — used / limit only (used in the toolbar usage indicator).
app.get('/api/quota', (req, res) => {
  res.json({ used: dirUsageBytes(req.userDir), limit: QUOTA_BYTES });
});

// GET /api/files?path=/foo — list folder contents.
app.get('/api/files', (req, res) => {
  const target = safePath(req.userDir, req.query.path);
  if (!target) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Not a folder; use /api/file to download' });
  }
  const entries = fs.readdirSync(target, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.'))
    .map(e => {
      const child = path.join(target, e.name);
      const childStat = fs.statSync(child);
      return {
        name: e.name,
        kind: e.isDirectory() ? 'folder' : 'file',
        size: childStat.size,
        modifiedAt: childStat.mtime.toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  res.json({ path: relPath(req.userDir, target), entries });
});

// GET /api/file?path=/foo.txt — download a single file.
app.get('/api/file', (req, res) => {
  const target = safePath(req.userDir, req.query.path);
  if (!target) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
  const stat = fs.statSync(target);
  if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });
  res.sendFile(target);
});

// POST /api/upload?path=/foo (multipart, field `file`) — upload to /foo/.
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const parent = safePath(req.userDir, req.query.path);
  if (!parent) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Quota check — uploads that would exceed the cap are rejected before
  // they land in the user's folder.
  const used = dirUsageBytes(req.userDir);
  if (used + req.file.size > QUOTA_BYTES) {
    fs.unlinkSync(req.file.path);
    return res.status(413).json({
      error: 'Quota exceeded',
      used,
      limit: QUOTA_BYTES,
      attempted: req.file.size,
    });
  }

  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  const dest = path.join(parent, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({
    ok: true,
    name: req.file.originalname,
    size: req.file.size,
    path: relPath(req.userDir, dest),
    used: used + req.file.size,
    limit: QUOTA_BYTES,
  });
});

// POST /api/folder { path } — create a folder.
app.post('/api/folder', (req, res) => {
  const target = safePath(req.userDir, req.body?.path);
  if (!target) return res.status(400).json({ error: 'Invalid path' });
  if (target === req.userDir) return res.status(400).json({ error: 'Path required' });
  if (fs.existsSync(target)) return res.status(409).json({ error: 'Already exists' });
  fs.mkdirSync(target, { recursive: true });
  res.json({ ok: true, path: relPath(req.userDir, target) });
});

// POST /api/rename { from, to } — move or rename.
app.post('/api/rename', (req, res) => {
  const from = safePath(req.userDir, req.body?.from);
  const to = safePath(req.userDir, req.body?.to);
  if (!from || !to) return res.status(400).json({ error: 'Invalid path' });
  if (from === req.userDir) return res.status(400).json({ error: 'Cannot rename root' });
  if (!fs.existsSync(from)) return res.status(404).json({ error: 'Source not found' });
  if (fs.existsSync(to)) return res.status(409).json({ error: 'Destination exists' });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  res.json({ ok: true, path: relPath(req.userDir, to) });
});

// DELETE /api/files?path=/foo — remove file or folder (recursive).
app.delete('/api/files', (req, res) => {
  const target = safePath(req.userDir, req.query.path);
  if (!target) return res.status(400).json({ error: 'Invalid path' });
  if (target === req.userDir) return res.status(400).json({ error: 'Cannot delete root' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
  fs.rmSync(target, { recursive: true, force: true });
  res.json({ ok: true });
});

// ── start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`File server listening on http://localhost:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Quota:    ${(QUOTA_BYTES / 1024 / 1024).toFixed(0)} MB per user`);
});
