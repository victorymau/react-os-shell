# file-server

Tiny per-user file storage server, intended to be paired with the
react-os-shell desktop demo. Each authenticated user gets their own folder
on disk under `data/{username}/`. ~150 lines, single file.

## Run

```
npm install
npm start
```

Server listens on `http://localhost:4000` by default (override with `PORT`).

On first run the server creates `users.json` with two demo users and random
bearer tokens. Edit it to add or rotate users — every entry is `username:
token`. Restart the server to pick up changes.

## API

All requests except `OPTIONS` require `Authorization: Bearer <token>`.

| Method | Path                             | Body / Query                       | Result                                        |
| ------ | -------------------------------- | ---------------------------------- | --------------------------------------------- |
| GET    | `/api/me`                        | —                                  | `{ user }`                                    |
| GET    | `/api/files?path=/foo`           | —                                  | `{ path, entries: [{ name, kind, size, modifiedAt }] }` |
| GET    | `/api/file?path=/foo.txt`        | —                                  | raw file bytes                                |
| POST   | `/api/upload?path=/foo`          | multipart, field `file`            | `{ ok, name, size, path }`                    |
| POST   | `/api/folder`                    | json `{ path }`                    | `{ ok, path }`                                |
| POST   | `/api/rename`                    | json `{ from, to }`                | `{ ok, path }`                                |
| DELETE | `/api/files?path=/foo`           | —                                  | `{ ok }` (recursive for folders)              |

`path` is always relative to the user's root. Path traversal (`..`) is
rejected with `400 Invalid path`.

## Production notes

This is a starter — keep it as one file, swap in only what your deployment
actually needs:

- **Auth**: replace fixed tokens with bcrypt + sessions or OAuth.
- **HTTPS**: terminate TLS at a reverse proxy.
- **Limits**: tune the `multer` `fileSize` cap and add per-user quota.
- **Backups**: `data/` is just a directory — point your backup at it.
- **Scale-out**: swap disk for S3/R2 with pre-signed upload URLs if you
  expect more than one server or large files.
