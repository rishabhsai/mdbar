# mdbar Cloud sync

This Worker is an optional sync mirror for mdbar's local Markdown notebook. A SQLite-backed Durable Object owns each private sync space, serializes writes, and keeps a cursor-based change log. Markdown on the device remains authoritative and usable offline.

## Local verification

```bash
npm install
cp .dev.vars.example .dev.vars
npm run check
npm test
npm run dev
```

## Deploy

```bash
npx wrangler login
openssl rand -hex 32
npx wrangler secret put MDBAR_ADMIN_SECRET
npm run deploy
```

Paste the random value into the `wrangler secret put` prompt. Do not add it to `wrangler.toml` or Git.

Create the first private sync space:

```bash
MDBAR_ADMIN_SECRET='the-same-random-value' \
  npm run create-space -- https://mdbar-sync.YOUR-SUBDOMAIN.workers.dev --write-ios
```

The command returns three values: Worker URL, Space ID, and device token. Keep the device token private.

## Connect devices

- macOS: open mdbar Settings → Cloud sync, paste all three values, and choose Connect. The token is stored in macOS Keychain.
- iOS and widgets: copy `ios/Config/Sync.local.xcconfig.example` to `ios/Config/Sync.local.xcconfig`, paste the three values, then regenerate/build the Xcode project.

`Sync.local.xcconfig`, `.dev.vars`, and Worker state are ignored by Git.

## Conflict policy

Writes include a base revision. A stale write receives HTTP 409 with the current server version. The native clients preserve the server copy beside the local note as:

```text
roadmap.conflict-cloud-20260711-184500.md
```

The local note is then uploaded as the canonical version. No note is silently overwritten.

## API

- `POST /v1/spaces` — create a space; protected by the Worker admin secret
- `GET /v1/spaces/:id/changes?since=:cursor` — incremental changes
- `GET /v1/spaces/:id/today?date=YYYY-MM-DD` — widget-friendly daily note
- `GET /v1/spaces/:id/notes/:path` — retrieve a note
- `PUT /v1/spaces/:id/notes/:path` — revisioned, idempotent write
- `DELETE /v1/spaces/:id/notes/:path` — revisioned tombstone

Every space endpoint requires its device token as a Bearer token.
