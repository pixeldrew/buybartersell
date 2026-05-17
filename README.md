# buybartersell

A TypeScript/Express WhatsApp group moderation and stats service. It connects to
WhatsApp through Baileys, stores watched-group messages in MongoDB, analyzes gear
buy/sell intent with an OpenAI-compatible local/remote LLM endpoint, and serves
React admin and join-approval UIs.

## Requirements

- Node.js 24+
- MongoDB
- A WhatsApp account for the bot identity
- The bot account must be a group admin for join approvals and moderation actions
- Google OAuth/OIDC credentials for the admin dashboard

## Setup

```bash
npm install
npm run build
npm start
```

Environment files are loaded with `dotenv-flow`, so `.env`, `.env.local`, and
environment-specific variants are supported.

On first WhatsApp login the app prompts for a phone number and prints a pairing
code. Enter it in WhatsApp under **Settings -> Linked Devices -> Link a Device ->
Link with phone number**. Credentials are saved in MongoDB's `baileys_auth`
collection. To re-authenticate, clear that collection and restart.

## Development

```bash
npm run dev         # Express app via ts-node
npm run dev:admin   # Vite admin app with backend proxying
npm run dev:join    # Vite join app with backend proxying
```

`npm run build` compiles the backend and builds both Vite apps:

- `/admin/dashboard` serves the admin React app from `client/admin/dist`
- `/join/:token` serves the public terms approval app from `client/join/dist`

The admin and join Vite projects use `vite-plugin-mkcert` for local HTTPS. The
admin app proxies `/api/admin/*`, `/login`, `/callback`, and `/logout` to the
backend. The join app proxies `/api/join/*`.

## Workspaces

This repo uses npm workspaces:

- `client/admin` - protected admin dashboard
- `client/join` - public terms approval flow
- `client/ui` - shared shadcn/ui primitives and theme tokens

Each app owns Tailwind generation and explicitly scans `client/ui/src` so shared
component utilities are included in built CSS.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `3000` | Express server port |
| `MONGODB_URI` | `mongodb://localhost:27017/whatsapp-stats` | MongoDB connection string |
| `WATCH_GROUP_ID` | unset | Group JID to watch, e.g. `123456789@g.us` |
| `APP_URL` | `http://localhost:3000` | Fallback public app URL for generated join links |
| `MEDIA_DIR` | `./media` | Directory for downloaded WhatsApp media |
| `MEDIA_ALBUM_COLLATE_MS` | `1500` | Delay used to collate multi-media album messages |
| `LMSTUDIO_URL` | `http://localhost:1234` | OpenAI-compatible chat completions base URL |
| `LMSTUDIO_MODEL` | `qwen/qwen3-vl-30b-a3b-instruct` | Model used by message analysis |
| `ORKEY` | unset | Optional bearer token for the LLM endpoint |
| `OIDC_ISSUER_BASE_URL` | required for admin auth | OIDC issuer, e.g. `https://accounts.google.com` |
| `OIDC_BASE_URL` | required for admin auth | Public origin registered with Google |
| `OIDC_CLIENT_ID` | required for admin auth | Google OAuth client ID |
| `OIDC_CLIENT_SECRET` | required for admin auth | Google OAuth client secret |
| `OIDC_SECRET` | required for admin auth | Session cookie secret, at least 8 characters |
| `ADMIN_EMAILS` | required for admin auth | Comma-separated allowlist of admin Google emails |

The admin dashboard can also persist `appUrl` in MongoDB's `admin_settings`
collection. When present, that value takes precedence over `APP_URL` for join
links.

For Google OAuth, configure the redirect URI as:

```text
${OIDC_BASE_URL}/callback
```

For local HTTPS admin development this is usually:

```text
https://localhost:5173/callback
```

## HTTP Routes

All JSON API routes are mounted under `/api`.

### Public API

- `GET /api/status` - WhatsApp connection status
- `GET /api/join/:token/status` - Validate a terms approval token
- `POST /api/join/:token/accept` - Accept terms and approve the join request
- `POST /api/join/:token/reject` - Decline terms and reject the join request

### Protected Admin API

Routes under `/api/admin/*` require Google OIDC login and an allowlisted,
verified email. Unauthenticated API requests return:

```json
{ "error": "Authentication required" }
```

Admin API routes:

- `GET /api/admin/groups` - WhatsApp groups visible to the bot
- `GET /api/admin/tracked-group/users` - users in the configured tracked group
- `POST /api/admin/tracked-group/users/remove` - remove a member from the tracked group
- `GET /api/admin/stats`
- `GET /api/admin/settings`
- `POST /api/admin/settings/app-url`
- `POST /api/admin/settings/terms-gate`

### Pages

- `GET /admin/dashboard` - protected admin dashboard
- `GET /join/:token` - public terms approval app
- `/login`, `/callback`, `/logout` - provided by `express-openid-connect`

If OIDC is not configured, admin routes fail closed.

## Message Watching And Analysis

When `WATCH_GROUP_ID` is configured, the watcher subscribes to Baileys message
events for that group and stores messages in MongoDB. It:

- resolves sender phone numbers from WhatsApp JIDs, group metadata, and contacts
- downloads image, video, audio, sticker, and document media into `MEDIA_DIR`
- stores media paths relative to the current working directory
- collates multi-media WhatsApp albums into a single database message entry
- stores quoted-message links when available

The analyzer classifies unanalyzed messages from the last hour into structured
gear fields and a sentiment of `selling`, `wanted`, `info`, or `unrelated`.
Analysis failures are logged and skipped instead of being saved as unrelated.

Run batch analysis manually with:

```bash
bin/analyze.ts
```

In the production container, use the compiled runtime wrapper after the image
has been built:

```bash
node dist/bin/analyze.mjs
```

For production scheduling, prefer a platform scheduled job or host cron that
runs this one-off container command rather than cron inside the app container.

## Terms Approval Gate

The admin dashboard controls whether join requests are gated by terms approval.
The setting is saved in MongoDB's `admin_settings` collection and defaults to
disabled.

When enabled, join requests for `WATCH_GROUP_ID` receive a `/join/:token` link.
Accepting the terms approves the WhatsApp join request; declining rejects it.
When disabled, the bot ignores join requests so WhatsApp or human admins can
handle them.

## Verification

```bash
npm run build
npm test
```

The Vite admin bundle currently emits a large chunk warning during build; the
build still succeeds.
