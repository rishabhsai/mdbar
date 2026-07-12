# mdbar notebook format

mdbar keeps user-authored content in ordinary Markdown files. Richer task behavior is encoded in optional, readable directives on task lines.

```markdown
- [ ] Review the launch checklist #carry
- [ ] Morning pages #reuse
- [ ] Call Alex @remind(10:30)
```

- `#carry` or `[carry]`: copy the task to the next daily note only while it is unfinished.
- `#reuse` or `[reuse]`: copy the task to the next daily note whether or not it was completed.
- `@remind(HH:mm)`: schedule a local reminder on the date of the daily note.

Directives are case-insensitive. Copied tasks are de-duplicated by their visible text and directives. Daily notes live at `daily/YYYY-MM-DD.md`; library notes live anywhere below `notes/`.

Markdown on each device remains the source of truth. Optional cloud sync mirrors files by path and revision; widgets use the cloud copy when configured and an App Group JSON snapshot as a fast local fallback.
