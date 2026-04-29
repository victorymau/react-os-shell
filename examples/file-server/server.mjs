// Tiny per-user file server. Each authenticated user has its own folder
// on disk under ./data/{username}/. All file operations are scoped to that
// folder via `safePath()` which rejects anything that escapes via `../`.
//
// Auth is intentionally minimal — a fixed token per user, looked up in
// users.json. For production use, swap in real password hashing + sessions
// or OAuth, add HTTPS, rate limiting, and stricter upload size caps.

import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const TMP_DIR = path.join(__dirname, 'tmp');
const USERS_FILE = path.join(__dirname, 'users.json');

for (const dir of [DATA_DIR, TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── users ────────────────────────────────────────────────────────────────
let users = {};
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
} else {
  // Seed two demo users with random tokens. Edit users.json to add more.
  users = {
    alice: crypto.randomBytes(16).toString('hex'),
    bob: crypto.randomBytes(16).toString('hex'),
  };
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + '\n');
  console.log('Seeded users.json with two demo users.');
}

// ── app ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS: open to all origins in dev. Lock this down for production.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth middleware — bearer token must match an entry in users.json.
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });
  const username = Object.keys(users).find(u => users[u] === token);
  if (!username) return res.status(401).json({ error: 'Invalid token' });
  req.user = username;
  req.userDir = path.join(DATA_DIR, username);
  if (!fs.existsSync(req.userDir)) fs.mkdirSync(req.userDir, { recursive: true });
  next();
}

// Resolve a user-supplied path against the user's root, refusing anything
// that escapes (path traversal). Returns null on rejection.
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

// ── routes ───────────────────────────────────────────────────────────────

// GET /api/me — sanity check; returns the authenticated user.
app.get('/api/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/files?path=/foo — list folder contents.
app.get('/api/files', auth, (req, res) => {
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
app.get('/api/file', auth, (req, res) => {
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB; tune as needed
});
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const parent = safePath(req.userDir, req.query.path);
  if (!parent) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  const dest = path.join(parent, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({
    ok: true,
    name: req.file.originalname,
    size: req.file.size,
    path: relPath(req.userDir, dest),
  });
});

// POST /api/folder { path } — create a folder.
app.post('/api/folder', auth, (req, res) => {
  const target = safePath(req.userDir, req.body?.path);
  if (!target) return res.status(400).json({ error: 'Invalid path' });
  if (target === req.userDir) return res.status(400).json({ error: 'Path required' });
  if (fs.existsSync(target)) return res.status(409).json({ error: 'Already exists' });
  fs.mkdirSync(target, { recursive: true });
  res.json({ ok: true, path: relPath(req.userDir, target) });
});

// POST /api/rename { from, to } — move or rename.
app.post('/api/rename', auth, (req, res) => {
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
app.delete('/api/files', auth, (req, res) => {
  const target = safePath(req.userDir, req.query.path);
  if (!target) return res.status(400).json({ error: 'Invalid path' });
  if (target === req.userDir) return res.status(400).json({ error: 'Cannot delete root' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'Not found' });
  fs.rmSync(target, { recursive: true, force: true });
  res.json({ ok: true });
});

// ── start ────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`File server listening on http://localhost:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Users: ${Object.keys(users).join(', ')}`);
  console.log(`Tokens are in ${USERS_FILE}.`);
});
