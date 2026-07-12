# Cloud sync architecture

mdbar is local-first. Cloud sync mirrors only Markdown documents below `daily/` and `notes/`; the filesystem remains the primary editing surface.

```text
macOS app ─┐
iOS app ───┼── HTTPS ── Cloudflare Worker ── Durable Object (SQLite)
widgets ───┘
```

Each sync space has a random 256-bit token. The client keeps the token private and the Durable Object stores only a SHA-256 hash. Every note has a monotonically increasing revision. Clients keep a local cursor and content hash per path in `.mdbar/` metadata.

## Offline behavior

Edits are written to Markdown first. A synchronization attempt follows in the background. Network failures change the status to “Offline · changes queued”; no separate cloud database is required to continue editing. On the next successful attempt, file hashes identify every unsent local change.

## Concurrent edits

Clients submit their last known revision with each write. If that revision is stale, the Worker returns the newest version. mdbar writes that version to a timestamped conflict file, uploads the user's local version, and leaves both visible as ordinary Markdown.

## Deletes and moves

Deletes are revisioned tombstones, so an offline device learns that a path was removed. A move is represented as a new path plus a tombstone for the previous path. Nested note folders are supported.

## Widgets

When cloud configuration is present, widgets fetch Today's note directly from the Worker and interactive checkmarks use the same revisioned write API. The local App Group snapshot remains a fast fallback where that entitlement is available.

## Current scope

Attachments are intentionally excluded from v1. Markdown image paths continue to work locally. R2 can be added later with content-addressed objects and signed uploads without changing the note protocol.
