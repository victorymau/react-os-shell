# @react-os-shell/server

IMAP/SMTP/CalDAV bridge server for the react-os-shell Email and Calendar apps.
The shell library is client-only — this server speaks the TCP protocols a
browser can't.

## Run

```bash
cd server
npm install
cp .env.example .env       # edit if needed
npm run dev                # http://localhost:3001
```

Or from the repo root:

```bash
npm run server:install
npm run dev:all            # library demo + server in one terminal
```

## Endpoints

All `/api/*` endpoints except `/api/auth/login` require the `shell_session`
cookie.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/mail/folders`
- `GET /api/mail/messages?folder=&page=&pageSize=&search=`
- `GET /api/mail/messages/:folder/:uid`
- `GET /api/mail/messages/:folder/:uid/attachments/:partId`
- `POST /api/mail/messages/:folder/:uid/flags` (`{ add?, remove? }`)
- `POST /api/mail/messages/:folder/:uid/move` (`{ destinationFolder }`)
- `DELETE /api/mail/messages/:folder/:uid`
- `POST /api/mail/send`
- `POST /api/mail/drafts`
- `GET /api/mail/threads/:threadId?folder=`
- `GET /api/mail/unread-counts`
- `GET /api/calendar/calendars`
- `GET /api/calendar/calendars/:id/events?start=&end=`
- `POST /api/calendar/calendars/:id/events`
- `PUT /api/calendar/calendars/:id/events/:uid` (`If-Match: <etag>`)
- `DELETE /api/calendar/calendars/:id/events/:uid` (`If-Match: <etag>`)

## Supported providers (tested)

- Fastmail — `imap.fastmail.com:993`, `smtp.fastmail.com:465`, `https://caldav.fastmail.com/`
- iCloud — requires app-specific password
- Yahoo — requires app-specific password

Gmail and Outlook require app-specific passwords or OAuth (not supported).

## Environment

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3001` | listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | allowed browser origin |
| `NODE_ENV` | `development` | when `production`, cookies use `Secure` |

## Session model

In-memory `Map<token, SessionRecord>` keyed by an HttpOnly cookie. Server
restart loses sessions; users re-log in. No disk persistence by design.
