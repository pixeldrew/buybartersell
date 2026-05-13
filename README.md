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
```

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
