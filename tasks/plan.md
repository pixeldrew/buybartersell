# Implementation Plan: Save Activity Poll Read Receipts

## Overview
Persist delivery and read receipts for WhatsApp activity polls sent through Baileys. The existing activity poll flow already stores the poll message id, expected participants, and explicit poll responses; this change adds receipt tracking for the same poll message so the admin API can report how many expected participants received and read the poll, even if they did not vote.

## Current Shape
- `src/activity-polls.ts` owns the activity poll domain model, Mongoose schema, store interface, summaries, response extraction, and socket event registration.
- `startActivityPollTracker()` currently listens to `messages.upsert` and records `pollUpdateMessage` responses.
- Baileys emits group message delivery/read receipts through `message-receipt.update`, where each update contains `key.remoteJid`, `key.id`, `receipt.userJid`, `receipt.receiptTimestamp`, and/or `receipt.readTimestamp`.
- `tests/activity-polls.test.ts` already uses a memory store and fake socket event registration, which is the right place to add most coverage.

## Dependency Graph
1. Domain types and persistence schema
2. Summary derivation and matching/deduplication helpers
3. Receipt extraction and recording service logic
4. Socket tracker event wiring
5. API/UI exposure, if desired
6. Verification through unit tests and TypeScript build

## Architecture Decisions
- Store receipt state on the activity poll record as participant-scoped arrays, similar to `responses`, instead of adding a separate collection. This keeps the latest activity poll API self-contained and matches the existing store abstraction.
- Track expected participant receipts only. Unknown receipt users should be ignored in summaries, matching current response behavior.
- Treat reads as implying delivery for summary counts if a read receipt arrives without a prior delivery receipt. WhatsApp may send both, but this makes the summary resilient to event ordering.
- Preserve first-seen timestamps for idempotency. Duplicate receipts should not overwrite earlier delivery/read times.
- Keep closed polls immutable for receipts unless explicitly chosen otherwise. The existing `findOpenByPollMessage()` pattern means late receipts after closing will not be recorded; this matches current poll response behavior and limits surprise. This is an open question if historical receipt completion matters.

## Task List

### Phase 1: Persistence and Summary Foundation

## Task 1: Add Receipt Fields to Activity Poll Records

**Description:** Extend activity poll domain types, Mongoose schema, record serialization, inserts, and updates to include delivery and read receipt arrays.

**Acceptance criteria:**
- [ ] `ActivityPollRecord` includes `deliveredReceipts` and `readReceipts` arrays with participant id, phone number, and timestamp.
- [ ] Existing records without these fields load as empty arrays.
- [ ] New activity polls initialize both arrays as empty.

**Verification:**
- [ ] Run `npm test -- tests/activity-polls.test.ts`.
- [ ] Run `npm run build:server`.

**Dependencies:** None

**Files likely touched:**
- `src/activity-polls.ts`
- `tests/activity-polls.test.ts`

**Estimated scope:** Small

## Task 2: Add Receipt-Derived Summary Counts

**Description:** Extend `ActivityPollSummary` with receipt counts and participant lists, derived from expected participants and persisted receipt arrays.

**Acceptance criteria:**
- [ ] Summary exposes `deliveredCount`, `readCount`, `deliveredParticipants`, `readParticipants`, and optionally `unreadParticipants`.
- [ ] Read receipts count as read and delivered for summary purposes.
- [ ] Duplicate receipt records do not inflate counts.

**Verification:**
- [ ] Add unit coverage around `activityPollSummaryFromRecord()`.
- [ ] Run `npm test -- tests/activity-polls.test.ts`.

**Dependencies:** Task 1

**Files likely touched:**
- `src/activity-polls.ts`
- `tests/activity-polls.test.ts`

**Estimated scope:** Small

### Checkpoint: Foundation
- [ ] Activity poll tests pass.
- [ ] Server TypeScript build passes.
- [ ] JSON shape change is intentional and acceptable for admin consumers.

### Phase 2: Receipt Recording

## Task 3: Extract Baileys Receipt Events for Activity Polls

**Description:** Add a pure extraction helper that accepts Baileys `message-receipt.update` payloads and returns normalized activity poll receipt events.

**Acceptance criteria:**
- [ ] The helper returns events with `groupId`, `pollMessageId`, `participantId`, `deliveredAt`, and/or `readAt`.
- [ ] It ignores updates without `key.remoteJid`, `key.id`, or `receipt.userJid`.
- [ ] It handles delivery-only, read-only, and combined receipt payloads.

**Verification:**
- [ ] Add unit tests with representative Baileys receipt update objects.
- [ ] Run `npm test -- tests/activity-polls.test.ts`.

**Dependencies:** Task 1

**Files likely touched:**
- `src/activity-polls.ts`
- `tests/activity-polls.test.ts`

**Estimated scope:** Small

## Task 4: Persist Receipt Events Idempotently

**Description:** Add a store-backed function to match receipt users to expected participants and persist first delivery/read timestamps without duplicating entries.

**Acceptance criteria:**
- [ ] Matching supports exact JID and phone-number matching using the existing participant matching behavior.
- [ ] Delivery receipts add one delivered receipt per expected participant.
- [ ] Read receipts add one read receipt and ensure the participant is considered delivered in summaries.
- [ ] Replaying the same receipt event keeps counts stable and preserves the original timestamp.
- [ ] Receipts for non-expected participants are ignored.

**Verification:**
- [ ] Add unit tests for idempotency, phone-number matching, read-before-delivery, and ignored unknown users.
- [ ] Run `npm test -- tests/activity-polls.test.ts`.

**Dependencies:** Tasks 1 and 2

**Files likely touched:**
- `src/activity-polls.ts`
- `tests/activity-polls.test.ts`

**Estimated scope:** Medium

### Checkpoint: Core Recording
- [ ] Unit tests cover extraction and persistence without a live WhatsApp socket.
- [ ] Existing response recording tests still pass.
- [ ] Build passes before event wiring.

### Phase 3: Socket Wiring and API Surface

## Task 5: Wire `message-receipt.update` Into the Activity Poll Tracker

**Description:** Extend `startActivityPollTracker()` so the same tracker that records poll votes also listens for Baileys receipt updates and persists them asynchronously.

**Acceptance criteria:**
- [ ] The tracker registers a `message-receipt.update` handler.
- [ ] Handler calls the receipt extraction and recording functions.
- [ ] Errors are logged with a distinct activity-poll receipt message.
- [ ] Existing `messages.upsert` poll response behavior is unchanged.

**Verification:**
- [ ] Add a fake-socket unit test proving the receipt handler updates the memory store.
- [ ] Run `npm test -- tests/activity-polls.test.ts`.

**Dependencies:** Tasks 3 and 4

**Files likely touched:**
- `src/activity-polls.ts`
- `tests/activity-polls.test.ts`

**Estimated scope:** Small

## Task 6: Confirm Admin API Response Shape

**Description:** Decide whether the existing latest activity poll endpoint should simply include the new summary fields or whether admin-route/frontend changes are needed.

**Acceptance criteria:**
- [ ] `GET /api/admin/activity-polls/latest` returns receipt fields because it serializes `ActivityPollSummary`.
- [ ] If the admin UI already renders unknown summary fields nowhere, no UI change is required for persistence-only scope.
- [ ] If the desired scope includes display, add a follow-up task for UI rendering rather than mixing it into receipt persistence.

**Verification:**
- [ ] Run the relevant admin route tests if present; otherwise rely on `npm test` and `npm run build:server`.
- [ ] Optionally manually inspect the API response from a seeded or live poll.

**Dependencies:** Task 5

**Files likely touched:**
- `src/admin-routes.ts` only if route behavior needs adjustment
- Admin UI files only if scope expands to display receipts

**Estimated scope:** XS for API-only, Medium if UI display is added

### Checkpoint: End-to-End
- [ ] Activity poll tests pass.
- [ ] Full test suite passes with `npm test`.
- [ ] Server build passes with `npm run build:server`.
- [ ] Receipt fields appear in the latest activity poll summary.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Receipt event shape differs slightly in runtime | Medium | Keep extraction defensive and log only after filtering malformed updates. Verify against local Baileys types in `node_modules/@whiskeysockets/baileys`. |
| Late receipts after poll close are dropped | Medium | Decide before implementation whether `findOpenByPollMessage()` should become `findByPollMessage()` for receipts. Current plan keeps existing open-only behavior. |
| LID vs phone-number JIDs may not match expected participants | Medium | Reuse existing matching logic first; add tests for phone-number fallback. If LID mapping is needed, make it a separate enhancement. |
| Summary counts might confuse response counts | Low | Name fields explicitly as delivered/read and keep response fields unchanged. |
| Existing Mongo records lack new arrays | Low | Schema defaults and serialization fallbacks should return empty arrays. |

## Open Questions
- Should receipts continue to be recorded after a poll is closed, or should closed polls freeze all activity as they do today?
- Do you want the admin dashboard UI to display delivered/read counts now, or is API/database persistence enough for this increment?
- Should read receipts imply delivered persistence in storage, or only in summary calculations?

## Recommended Implementation Order
1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Checkpoint: Core Recording
6. Task 5
7. Task 6
8. Final verification
