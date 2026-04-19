# mdbar

mdbar is a macOS menu bar markdown notebook built around plain files on disk.

It opens from the menu bar, drops you straight into today’s note, and keeps everything in a normal folder you can browse with Finder, Git, Obsidian, or any editor you want.

## What mdbar does

- Lives in the macOS menu bar instead of a normal dock-first workflow
- Stores daily notes in `daily/YYYY-MM-DD.md`
- Stores side notes as normal markdown files inside `notes/`
- Supports nested folders in the notes library
- Opens to today’s note and focuses the editor from a global shortcut
- Uses a live rendered markdown editor instead of a raw textarea
- Supports dark mode, font selection, font size, line height, images, links, and autosave

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

- Landing page: [site/index.html](/Users/rishabhsai/Desktop/better%20inbuilt%20markdown%20browser/mdbar/site/index.html)
- Static download artifact: [site/downloads/mdbar-0.1.0-aarch64.dmg](/Users/rishabhsai/Desktop/better%20inbuilt%20markdown%20browser/mdbar/site/downloads/mdbar-0.1.0-aarch64.dmg)
- GitHub repo: [github.com/rishabhsai/mdbar](https://github.com/rishabhsai/mdbar)
- Releases: [github.com/rishabhsai/mdbar/releases](https://github.com/rishabhsai/mdbar/releases)

Current checked artifact is an Apple Silicon macOS DMG.

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

## Project structure

- `src/`: React app for the mdbar panel UI
- `src-tauri/`: Tauri and Rust backend
- `site/`: static landing page for Vercel or any static host

## Shipping the landing page

The landing page is the standalone static site in `site/`.

If you want to host it on Vercel, point Vercel at that directory or copy its contents into the deployment root. The current download button is wired to:

```text
./downloads/mdbar-0.1.0-aarch64.dmg
```

So the `site/downloads/` folder needs to be deployed with the page.

## Stack

- Tauri 2
- Rust
- React
- TypeScript
- Tiptap

## License

[MIT](./LICENSE)
