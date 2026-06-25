# mdbar

mdbar is a macOS menu bar markdown notebook built around plain files on disk.

Press `Cmd+Shift+M`, drop into today’s note, and start typing. Everything stays in a normal folder you can browse with Finder, Git, Obsidian, or any editor you want.

![mdbar screenshot](https://i.imgur.com/bRB0KrG.png)

## Performance

CPU usage:

[Open CPU screenshot](https://imgur.com/DJ2pN4i)

![mdbar CPU usage](https://i.imgur.com/DJ2pN4i.png)

Memory usage:

[Open memory screenshot](https://imgur.com/NByPVNy)

![mdbar memory usage](https://i.imgur.com/NByPVNy.png)

## What mdbar does

- Lives in the macOS menu bar instead of a normal dock-first workflow
- Stores daily notes in `daily/YYYY-MM-DD.md`
- Stores side notes as normal markdown files inside `notes/`
- Supports nested folders in the notes library
- Opens to today’s note and focuses the editor from a global shortcut
- Uses a live rendered markdown editor instead of a raw textarea
- Supports dark mode, font selection, font size, line height, images, links, and autosave

## Keyboard shortcuts

- `Cmd+Shift+M`: open mdbar from anywhere
- `←`: previous day
- `→`: next day
- `Cmd+O`: open the current note in your default editor
- `Cmd+Shift+O`: reveal the current note in Finder
- `Esc`: go back through the current view stack, then hide the panel

The global launcher is configurable in settings, but `Cmd+Shift+M` is the default.

## Storage model

Pick one notebook folder and mdbar manages a structure like this:

```text
your-notebook/
  daily/
    2026-04-18.md
    2026-04-19.md
  notes/
    ideas.md
    projects/
      roadmap.md
```

There is no database. Your notes stay as plain `.md` files.

## Download

- Website: [mdbar.run](https://mdbar.run/)
- GitHub repo: [github.com/rishabhsai/mdbar](https://github.com/rishabhsai/mdbar)
- Releases: [github.com/rishabhsai/mdbar/releases](https://github.com/rishabhsai/mdbar/releases)

Use the GitHub Releases page for the current macOS build.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run tauri dev
```

Build the web app:

```bash
npm run build
```

Build the macOS bundle:

```bash
npm run tauri build
```

Publish a signed and notarized macOS release:

```bash
./scripts/release-macos.sh
```

The release script refuses to publish unless a Developer ID Application
certificate and Apple notarization credentials are available.

## Project structure

- `src/`: React app for the mdbar panel UI
- `src-tauri/`: Tauri and Rust backend
- `site/`: static landing page for Vercel or any static host

## Shipping the landing page

The landing page is the standalone static site in `site/`. Its download buttons
link to GitHub Releases so the website never needs to ship a stale DMG.

## Stack

- Tauri 2
- Rust
- React
- TypeScript
- Tiptap

## License

[MIT](./LICENSE)
