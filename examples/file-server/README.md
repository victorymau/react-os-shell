# file-server

Tiny per-browser file storage server, intended to be paired with the
react-os-shell desktop demo. Identity is a random user ID assigned by an
`HttpOnly` cookie on first visit — no login required. Each user gets a
folder under `data/{userId}/` plus a quota cap (default 100 MB). ~200
lines, single file.

## Run

```
npm install
npm start
```

Server listens on `http://localhost:4000` by default.

Environment overrides:
- `PORT` — listen port (default `4000`).
- `QUOTA_BYTES` — per-user quota in bytes (default `104857600`, i.e. 100 MB).
- `MAX_UPLOAD_BYTES` — single-file cap; auto-clamped to the quota.

## Auth model

The server identifies users by an `HttpOnly` cookie called `fs_uid`. First
request without one gets a fresh 16-byte random ID and a 10-year cookie:

```
Set-Cookie: fs_uid=…; Path=/; Max-Age=315360000; HttpOnly; SameSite=None; Secure
```

Browsers treat `localhost` as a secure context for the `Secure` flag, so
this works for local dev. **Clearing site cookies = losing access to your
files** — that's by design for the simple-demo case. Production deployments
typically wrap this behind a real auth flow.

The client must send `credentials: 'include'` on every fetch so the cookie
travels with cross-origin requests. CORS reflects the request `Origin` and
sets `Access-Control-Allow-Credentials: true`.

## Quota

Every upload re-walks the user's folder, sums file sizes, and rejects the
upload (`413`) when `used + new file size > QUOTA_BYTES`. Cheap enough at
the demo scale; cache or use a counter file for larger deployments.

## API

| Method | Path                             | Body / Query                       | Result                                        |
| ------ | -------------------------------- | ---------------------------------- | --------------------------------------------- |
| GET    | `/api/me`                        | —                                  | `{ user, used, limit }`                       |
| GET    | `/api/quota`                     | —                                  | `{ used, limit }`                             |
| GET    | `/api/files?path=/foo`           | —                                  | `{ path, entries: [{ name, kind, size, modifiedAt }] }` |
| GET    | `/api/file?path=/foo.txt`        | —                                  | raw file bytes                                |
| POST   | `/api/upload?path=/foo`          | multipart, field `file`            | `{ ok, name, size, path, used, limit }` (`413` on quota) |
| POST   | `/api/folder`                    | json `{ path }`                    | `{ ok, path }`                                |
| POST   | `/api/rename`                    | json `{ from, to }`                | `{ ok, path }`                                |
| DELETE | `/api/files?path=/foo`           | —                                  | `{ ok }` (recursive for folders)              |

`path` is always relative to the user's root. Path traversal (`..`) is
rejected with `400 Invalid path`.

## Production notes

This is a starter — keep it as one file, swap in only what your deployment
actually needs:

- **Auth**: replace cookie-only identity with a real login flow if you
  expect users on multiple devices or care about account recovery.
- **HTTPS**: terminate TLS at a reverse proxy. The `Secure` cookie attribute
  needs HTTPS in production.
- **Quota**: walking the folder per upload is fine for hundreds of files;
  cache or maintain a running counter for thousands.
- **Limits**: tune `QUOTA_BYTES` and `MAX_UPLOAD_BYTES` to your storage.
- **Backups**: `data/` is just a directory — point your backup at it.
- **Scale-out**: swap disk for S3/R2 with pre-signed upload URLs if you
  expect more than one server.
