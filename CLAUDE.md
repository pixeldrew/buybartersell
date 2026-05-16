# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled output (requires build first)
npm run dev     # Run via ts-node directly (no build needed)
```

## Architecture

TypeScript/Express app with a single-instance WhatsApp socket managed as module-level state, MongoDB message persistence, local LLM analysis via Ollama, and a stats dashboard.

**`src/whatsapp.ts`** — Baileys connection layer. Owns the `WASocket` singleton and `isConnected` flag. On first run (no `auth_info/` credentials), interactively prompts for a phone number and prints a pairing code. On subsequent runs it reconnects automatically using saved credentials. Auto-reconnects on disconnection unless the reason is `loggedOut`. Calls `startWatcher(sock)` after socket creation.

**`src/routes.ts`** — Express router mounted at `/api`. Endpoints: `GET /status`, `GET /groups`, `POST /send`, `GET /stats`, `GET /dashboard`.

**`src/index.ts`** — Bootstraps Express, calls `connectDB()` and `connectToWhatsApp()` concurrently with the HTTP server starting.

**`src/db.ts`** — Mongoose connection and `Message` model. Helpers: `saveMessage`, `updateAnalysis`, `getWeeklyPostCounts`, `getSentimentCounts`, `getMarketCounts`.

**`src/watcher.ts`** — Subscribes to `messages.upsert` on the Baileys socket for the group set in `WATCH_GROUP_ID`. Saves messages to MongoDB then fires async LLM analysis.

**`src/analyzer.ts`** — Calls Ollama's HTTP API to classify each message as `positive`/`negative`/`neutral` sentiment and `selling`/`buying`/`none` market intent. Falls back to `neutral`/`none` on error.

## Key details

- Auth credentials are persisted in `auth_info/` (gitignore this directory — it contains session keys).
- Group JIDs have the form `<number>@g.us`. The `sendGroupMessage` helper appends `@g.us` automatically if missing.
- Baileys logger is set to `silent` to suppress internal noise; connection events are logged to `console`.
- `tsconfig.json` uses `"moduleResolution": "node10"` with `"ignoreDeprecations": "6.0"` to stay compatible with Baileys' CommonJS exports under TypeScript 6.
- `Message.messageId` has a unique index — upserts deduplicate messages across reconnects.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `MONGODB_URI` | `mongodb://localhost:27017/whatsapp-stats` | MongoDB connection string |
| `WATCH_GROUP_ID` | (required for stats) | Group JID to watch, e.g. `123456789@g.us` |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server base URL |
| `OLLAMA_MODEL` | `llama3` | Ollama model for message analysis |

## Dashboard

Visit `GET /dashboard` for a dark-themed stats page showing posts per day (last 7 days), sentiment breakdown, and buy/sell gear counts. Auto-refreshes every 60 seconds. JSON data available at `GET /api/stats`.