# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # Compile TypeScript and build admin/join Vite apps
npm start       # Run compiled output (requires build first)
npm run dev     # Run via ts-node directly (no build needed)
```

## Architecture

TypeScript/Express app with a single-instance WhatsApp socket managed as module-level state, MongoDB message persistence, OpenAI-compatible LLM analysis, and React admin/join UIs.

**`src/whatsapp.ts`** — Baileys connection layer. Owns the `WASocket` singleton and `isConnected` flag. On first run (no saved MongoDB credentials), interactively prompts for a phone number and prints a pairing code. On subsequent runs it reconnects automatically using saved credentials. Auto-reconnects on disconnection unless the reason is `loggedOut`. Starts the watcher and join approval handlers after the connection opens.

**`src/routes.ts`** — Top-level Express router. Mounts JSON API routes under `/api`, serves the protected admin app at `/admin/dashboard`, and serves the public join app at `/join/:token`.

**`src/api-routes.ts`** — Public API router. Endpoints: `GET /status`, `/admin/*`, and `/join/*`.

**`src/admin-routes.ts`** — OIDC-protected admin API routes: groups, stats, and settings.

**`src/join-routes.ts`** — Public terms approval API routes for join tokens.

**`src/index.ts`** — Bootstraps Express, calls `connectDB()` and `connectToWhatsApp()` concurrently with the HTTP server starting.

**`src/db.ts`** — Mongoose connection and `Message` model. Helpers: `saveMessage`, `updateAnalysis`, `getWeeklyPostCounts`, `getSentimentCounts`, `getMarketCounts`.

**`src/watcher.ts`** — Subscribes to `messages.upsert` on the Baileys socket for the group set in `WATCH_GROUP_ID`. Saves messages to MongoDB then fires async LLM analysis.

**`src/analyzer.ts`** — Calls an OpenAI-compatible LM Studio chat completions endpoint to extract structured gear fields and classify messages as `selling`/`wanted`/`info`/`unrelated`. Batch analysis logs failures and leaves failed messages unanalyzed.

## Key details

- Auth credentials are persisted in MongoDB's `baileys_auth` collection. The local `auth_info/` directory is ignored for older/local Baileys file auth data.
- Group JIDs have the form `<number>@g.us`.
- Baileys logger is set to `silent` to suppress internal noise; connection events are logged to `console`.
- `tsconfig.json` uses `"moduleResolution": "node16"` with `"ignoreDeprecations": "6.0"`.
- `Message.messageId` has a unique index — upserts deduplicate messages across reconnects.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `MONGODB_URI` | `mongodb://localhost:27017/whatsapp-stats` | MongoDB connection string |
| `WATCH_GROUP_ID` | unset | Group JID to watch, e.g. `123456789@g.us` |
| `APP_URL` | `http://localhost:3000` | Fallback public app URL for generated join links |
| `MEDIA_DIR` | `./media` | Directory for downloaded WhatsApp media |
| `MEDIA_ALBUM_COLLATE_MS` | `1500` | Delay used to collate multi-media album messages |
| `LMSTUDIO_URL` | `http://localhost:1234` | OpenAI-compatible chat completions base URL |
| `LMSTUDIO_MODEL` | `qwen/qwen3-vl-30b-a3b-instruct` | Model used by message analysis |
| `ORKEY` | unset | Optional bearer token for the LLM endpoint |

## Dashboard

Visit `GET /admin/dashboard` for the protected admin UI showing posts per day, sentiment breakdown, buy/sell gear counts, and join-request settings. JSON data is available at `GET /api/admin/stats`.
