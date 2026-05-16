# whatsapp-spam

A Node.js/TypeScript service that connects a WhatsApp account via [Baileys](https://github.com/WhiskeySockets/Baileys) and exposes an Express HTTP API for sending group messages. It also includes a group moderation feature that auto-deletes messages containing invite links from non-admin members.

## Requirements

- Node.js 18+
- MongoDB
- A WhatsApp account (used as the bot identity)
- The bot account must be a **group admin** in any group where moderation is active

## Setup

```bash
npm install
npm run build
npm start
```

On first run you will be prompted for a phone number. A pairing code is then printed — enter it in WhatsApp under **Settings → Linked Devices → Link a Device → Link with phone number**. Credentials are saved in MongoDB's `baileys_auth` collection and reused on subsequent starts.

To re-authenticate, clear the `baileys_auth` collection and restart.

## Development

```bash
npm run dev   # run via ts-node, no build step needed
npm run dev:admin   # run the Vite admin app with API proxying to PORT/3000
npm run dev:join   # run the Vite join app with API proxying to PORT/3000
```

`npm run build` compiles the backend and builds the React admin app served at `/admin/dashboard` plus the public join app served at `/join/:token`.

## Admin Authentication

Admin routes under `/admin/*` and JSON routes under `/api/admin/*` require Google OIDC login and an email listed in `ADMIN_EMAILS`.

Configure these environment variables:

| Variable | Purpose |
|---|---|
| `OIDC_ISSUER_BASE_URL` | OIDC issuer URL, e.g. `https://accounts.google.com` |
| `OIDC_BASE_URL` | Public app origin registered with Google |
| `OIDC_CLIENT_ID` | Google OAuth client ID |
| `OIDC_CLIENT_SECRET` | Google OAuth client secret |
| `OIDC_SECRET` | Session cookie secret, at least 8 characters |
| `ADMIN_EMAILS` | Comma-separated allowlist of Google account emails |

Configure the Google OAuth redirect URI as `${OIDC_BASE_URL}/callback`.

## API

Base URL: `http://localhost:3000/api` (set `PORT` env var to override)

### `GET /api/status`
Returns whether the WhatsApp socket is currently connected.
```json
{ "connected": true }
```

### `GET /api/groups`
Returns all groups the account participates in.
```json
{
  "groups": [
    { "id": "1234567890-1234567890@g.us", "subject": "My Group", "participants": 42 }
  ]
}
```

### `POST /api/send`
Sends a text message to a group.

**Body:**
```json
{ "groupId": "1234567890-1234567890@g.us", "message": "Hello!" }
```
The `@g.us` suffix is appended automatically if omitted.

**Response:**
```json
{ "success": true, "groupId": "...", "message": "Hello!" }
```

## Group Moderation

The service listens to all incoming group messages. If a message contains a WhatsApp invite link (`chat.whatsapp.com/...`) and the sender is **not** a group admin or superadmin, the message is automatically deleted.

> **Note:** Removal of the offending user is implemented but commented out in `src/whatsapp.ts`. Uncomment `sock.groupParticipantsUpdate(...)` to enable it.

The bot account must be an admin of the group for both the deletion and removal to succeed.

## Terms Approval Gate

Visit `/admin/dashboard` to enable or disable the terms approval gate for join requests. The setting is saved in MongoDB's `admin_settings` collection and defaults to disabled.

When enabled, join requests for `WATCH_GROUP_ID` receive a Terms & Conditions link and are approved only after accepting. When disabled, the bot ignores join requests so WhatsApp or human admins can handle them manually.

The dashboard also manages the `APP_URL` used in generated terms links. If an `appUrl` setting exists in MongoDB it takes precedence over the shell `APP_URL`; otherwise the shell value is used, falling back to `http://localhost:3000`.
