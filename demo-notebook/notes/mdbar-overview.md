# mdbar

> A fast menu bar markdown notebook for macOS, built around plain files on disk.

---

## Why it exists

mdbar is designed for one simple habit:

- open instantly from the menu bar
- land in today's note
- type without context switching
- keep everything as normal `.md` files

## What makes it different

- **Menu bar first**: mdbar opens like a utility, not a full desktop app.
- **Plain files**: every note lives in your own folder structure.
- **Daily flow**: date-based notes are created automatically in `daily/`.
- **Real notes library**: side notes live in `notes/` and support nested folders.
- **Markdown that feels alive**: headings, lists, quotes, code blocks, links, images, and checklists render in place.

## A good setup

1. Pick one notebook folder.
2. Let mdbar handle `daily/`.
3. Organize everything else inside `notes/`.
4. Open it with a shortcut whenever something crosses your mind.

## Example use cases

- planning the day
- writing project notes
- keeping lightweight docs
- drafting ideas before moving them elsewhere

## Current product checklist

- [x] Menu bar app shell
- [x] Daily notes
- [x] Notes library with folders
- [x] Dark mode
- [x] Font controls
- [x] Global shortcut
- [x] Autosave
- [ ] Ship the first public release

## Notes format

### Nested organization

- Inbox
- Projects
  - mdbar
  - client work
- Ideas
- Writing

### Tiny snippet

```bash
npm install
npm run tauri dev
```

### Useful links

- GitHub: [rishabhsai/mdbar](https://github.com/rishabhsai/mdbar)
- Releases: [download builds](https://github.com/rishabhsai/mdbar/releases)

## Positioning

mdbar sits somewhere between:

- a scratchpad
- a daily note app
- a lightweight markdown notebook

It should feel fast, quiet, and always close at hand.
