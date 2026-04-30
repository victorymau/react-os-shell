# Google integration

The Email, Calendar, and Gemini apps each talk to Google APIs. There are
**three** ways to wire this up, with very different effort/reach tradeoffs.

| Path | Who signs in | Effort | When to use |
| ---- | ------------ | ------ | ----------- |
| 1. Demo mode | nobody — sample fixtures | none | Showcasing the UI |
| 2. BYO Client ID | each user pastes their own | small | Self-host, single user, dev |
| 3. Backend OAuth | one client, many users | substantial | Real product, public users |

The library ships with paths 1 and 2 wired up out of the box. Path 3 is
documented below as a reference.

---

## 1. Demo mode

Set `window.__REACT_OS_SHELL_DEMO_MODE__ = true` before mounting the app.
Email/Calendar render a small bundled fixture instead of trying to call
Google. A banner up top makes it clear data is mocked. Useful for
storyboards, screenshots, and the public Pages demo.

```js
// examples/demo/src/main.tsx (or wherever you bootstrap)
(window as any).__REACT_OS_SHELL_DEMO_MODE__ = true;
```

No Google Cloud setup needed.

---

## 2. Bring-your-own Google OAuth Client ID (current default)

What ships in `useGoogleAuth.ts`. Each user creates their own Google Cloud
project, configures an OAuth Web Client, and pastes the Client ID into
**Customization → Google API**. Their browser then talks to Google directly
using that Client ID.

### Setup

1. Open https://console.cloud.google.com and create a new project.
2. **APIs & Services → Library** — enable:
   - Gmail API
   - Google Calendar API
   - Generative Language API (for Gemini)
3. **APIs & Services → OAuth consent screen** — pick **External**, add an
   app name + support email + developer email. Add the scopes you need
   (Gmail readonly/compose/send/modify, Calendar readonly/events,
   generative-language.retriever). While the app is in **Testing** mode,
   add yourself as a test user — Google grants 100 test users without
   verification.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized JavaScript origins: the URL the demo is served from
     (`http://localhost:5173`, `https://yourdomain.com`, etc.).
   - Save and copy the Client ID.
5. In the running app, open **Customization** and paste the Client ID. The
   sign-in button now works.

### Limitations

- Google's Token Client (used by `useGoogleAuth`) only issues short-lived
  access tokens (~1 hour) — no refresh tokens. The library does silent
  refresh in-browser as long as the tab is open and the Google session is
  alive, but **closing the browser eventually requires re-consent** when
  the user comes back days later.
- Sensitive scopes (Gmail, Calendar) cap out at 100 users until you
  complete Google's verification process — weeks of review and a signed
  security questionnaire. Past 100 users, sign-in starts failing.

For more than a handful of self-hosters, move to path 3.

---

## 3. Backend OAuth code flow with refresh tokens

The "real product" pattern. One Google OAuth client owned by the operator;
users sign in once and their refresh token lives on a backend server,
which mints fresh access tokens forever (until they revoke or you restart
their session).

This isn't shipped — it's a backend you'd add yourself. Sketch:

### What you build

1. **Backend service** with three responsibilities:
   - `GET /auth/google/start` → redirects to
     `accounts.google.com/o/oauth2/v2/auth?client_id=…&redirect_uri=https://yourbackend/auth/google/callback&response_type=code&scope=…&access_type=offline&prompt=consent` — note `access_type=offline` is what makes Google return a refresh token.
   - `GET /auth/google/callback` → receives `?code=…`, exchanges it at
     `https://oauth2.googleapis.com/token` for `{ access_token, refresh_token, expires_in }`, stores the refresh token (encrypted) keyed by your own user identity, and sets a session cookie on the frontend.
   - Proxy endpoints (`/api/gmail/threads`, `/api/calendar/events`, …) that look up the user's refresh token, ask Google for a fresh access token if needed, and forward the request.

2. **Frontend changes** — the apps stop calling Google directly. `Email.tsx`'s `fetch('https://gmail.googleapis.com/...')` becomes `fetch('/api/gmail/threads', { credentials: 'include' })`. The frontend never sees an access token.

3. **Token storage** — at minimum encrypt refresh tokens at rest (AES-GCM with a key from env). Postgres or a single SQLite file is fine for hundreds of users; you don't need a fancy DB.

### Google Cloud setup

Same as path 2 above, plus:

- Add your backend's callback URL to **Authorized redirect URIs**:
  `https://yourbackend.example.com/auth/google/callback`.
- For public launch on sensitive scopes (Gmail/Calendar full access), submit
  your app for **verification**. Google will:
  - Inspect your privacy policy and terms.
  - Demand a signed security questionnaire (CASA Tier 2 for restricted
    scopes — annual external audit, ~$5–15k).
  - Verify domain ownership.
  - Process takes 4–8 weeks for the first round.
- Until verified, you're stuck at 100 users (test mode) and Google shows
  scary "Unverified app" warnings on consent.

### Why this works long-term

Refresh tokens issued with `access_type=offline` last **indefinitely**
unless:
- The user revokes access in
  https://myaccount.google.com/permissions.
- The user changes their password (only for some scope sets — Google
  varies on this).
- The token sits unused for 6 months.
- Your project is in testing mode (refresh tokens expire after 7 days
  there — another reason to verify for production).

In normal use, a user signs in once and the backend handles every API
call from then on. No re-consent loops.

### Estimated work

- Backend: ~500 LOC including encrypted token store + sample Gmail proxy.
- Frontend: ~200 LOC migrating each Google app off direct API calls.
- Infrastructure: a server (any cheap VM works), TLS termination, and
  encrypted key/secret management.
- Verification: 1–2 days of paperwork, 4–8 weeks waiting on Google.

Use path 2 until you have real users; switch to path 3 when 100 users
isn't enough or when "sign in every few days" stops being acceptable.
