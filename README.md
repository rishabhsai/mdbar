# mdbar

`mdbar` is a fast macOS menu bar markdown notebook built around plain files on disk.

## Goals

- Live in the menu bar instead of a normal dock app
- Default to today's note, stored as markdown
- Support normal notes alongside daily notes
- Make editing feel like a live rendered markdown surface instead of a raw textarea
- Stay lightweight enough to package cleanly for macOS distribution later

## Current Scope

- Menu bar panel with no normal dock-first workflow
- Daily notes plus regular notes, all stored as `.md` files
- A hybrid markdown editor with live rendered editing
- Dark mode, font controls, line height controls, and a configurable global shortcut
- A separate static landing page in [`site/`](./site)

## Development

```bash
npm install
npm run tauri dev
```

## Packaging

```bash
npm run tauri build
```

## Stack

- `Tauri 2`
- `React`
- `TypeScript`
- `Rust`

## License

MIT
