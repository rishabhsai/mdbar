import { open } from "@tauri-apps/plugin-dialog";
import {
  isRegistered,
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { SettingsSheet } from "./components/SettingsSheet";
import { formatDateLabel, shiftDateKey, todayKey } from "./lib/dates";
import { loadSettings, saveSettings } from "./lib/settings";
import {
  createLibraryFolder,
  createLibraryNote,
  listLibraryNotes,
  openDailyNote,
  openLibraryNote,
  saveNote,
  setPanelAutoHide,
  toggleMainWindow,
} from "./lib/tauri";
import type { AppSettings, NoteDocument, NoteSummary } from "./lib/types";
import "./App.css";

type ComposerKind = "note" | "folder";

function resolveInitialSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getNoteFolderLabel(relativePath: string) {
  const lastSlashIndex = relativePath.lastIndexOf("/");

  if (lastSlashIndex === -1) {
    return "notes";
  }

  return `notes/${relativePath.slice(0, lastSlashIndex)}`;
}

const onboardingTree = `your-notebook/
  daily/
    2026-04-18.md
    2026-04-19.md
  notes/
    ideas.md
    projects/
      mdbar-roadmap.md`;

const InkMarkdownEditor = lazy(async () => {
  const module = await import("./components/InkMarkdownEditor");
  return {
    default: module.InkMarkdownEditor,
  };
});

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [mode, setMode] = useState<"daily" | "library">("daily");
  const [dailyDateKey, setDailyDateKey] = useState(todayKey);
  const [libraryNotes, setLibraryNotes] = useState<NoteSummary[]>([]);
  const [selectedLibraryNoteId, setSelectedLibraryNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<NoteDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [shortcutStatus, setShortcutStatus] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<ComposerKind>("note");
  const [isNotePickerOpen, setIsNotePickerOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    resolveInitialSystemTheme,
  );
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const notePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isNotePickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!notePickerRef.current?.contains(target)) {
        setIsNotePickerOpen(false);
      }
    };

    const handleWindowBlur = () => {
      setIsNotePickerOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isNotePickerOpen]);

  useEffect(() => {
    setIsNotePickerOpen(false);
  }, [mode, dailyDateKey, selectedLibraryNoteId]);

  const appearance = settings.theme === "system" ? systemTheme : settings.theme;
  const editorFontFamily =
    settings.fontFamily === "editorial"
      ? '"Iowan Old Style", "Palatino Linotype", Georgia, serif'
      : settings.fontFamily === "mono"
        ? '"SF Mono", "JetBrains Mono", Menlo, monospace'
        : '"Avenir Next", "Helvetica Neue", sans-serif';
  const editorDocumentKey =
    currentNote?.filePath ??
    `${mode}:${dailyDateKey}:${selectedLibraryNoteId ?? "no-library-note"}`;
  const todayDateKey = todayKey();
  const title = mode === "daily" ? formatDateLabel(dailyDateKey) : currentNote?.title ?? "Notes";
  const disablePrevious = !settings.notebookPath || mode !== "daily";
  const disableNext =
    !settings.notebookPath || mode !== "daily" || dailyDateKey >= todayDateKey;

  useEffect(() => {
    if (!settings.notebookPath) {
      setLibraryNotes([]);
      setSelectedLibraryNoteId(null);
      setCurrentNote(null);
      setDraft("");
      setErrorMessage(null);
      setSaveState("idle");
      setIsLoadingNote(false);
      return;
    }

    let cancelled = false;

    async function syncNotebook() {
      setIsLoadingNote(true);
      setErrorMessage(null);

      try {
        const notes = await listLibraryNotes(settings.notebookPath!);
        if (cancelled) {
          return;
        }

        setLibraryNotes(notes);

        if (mode === "library") {
          const nextLibraryId =
            selectedLibraryNoteId && notes.some((note) => note.id === selectedLibraryNoteId)
              ? selectedLibraryNoteId
              : notes[0]?.id ?? null;

          if (nextLibraryId !== selectedLibraryNoteId) {
            setSelectedLibraryNoteId(nextLibraryId);
          }

          if (!nextLibraryId) {
            setCurrentNote(null);
            setDraft("");
            setSaveState("idle");
            return;
          }

          const note = await openLibraryNote(settings.notebookPath!, nextLibraryId);
          if (cancelled) {
            return;
          }

          setCurrentNote(note);
          setDraft(note.content);
          setSaveState("idle");
          return;
        }

        const note = await openDailyNote(settings.notebookPath!, dailyDateKey);
        if (cancelled) {
          return;
        }

        setCurrentNote(note);
        setDraft(note.content);
        setSaveState("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCurrentNote(null);
        setDraft("");
        setSaveState("idle");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setIsLoadingNote(false);
        }
      }
    }

    void syncNotebook();

    return () => {
      cancelled = true;
    };
  }, [dailyDateKey, mode, selectedLibraryNoteId, settings.notebookPath]);

  useEffect(() => {
    if (isLoadingNote || !currentNote || draft === currentNote.content) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await saveNote(currentNote.filePath, draft);

        setCurrentNote((existing) =>
          existing
            ? {
                ...existing,
                content: draft,
                updatedAtMs: result.updatedAtMs,
              }
            : existing,
        );
        setLibraryNotes((existing) =>
          existing.map((note) =>
            note.filePath === currentNote.filePath
              ? {
                  ...note,
                  updatedAtMs: result.updatedAtMs,
                }
              : note,
          ),
        );
        setSaveState(result.persisted ? "saved" : "idle");
        setErrorMessage(null);
      } catch (error) {
        setSaveState("idle");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }, 320);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [currentNote, draft, isLoadingNote]);

  useEffect(() => {
    let disposed = false;

    async function syncShortcut() {
      try {
        await unregisterAll();
        await register(settings.shortcut, async () => {
          await toggleMainWindow();
        });

        if (!disposed) {
          const registered = await isRegistered(settings.shortcut);
          setShortcutStatus(
            registered ? `Registered: ${settings.shortcut}` : "Shortcut is not available.",
          );
        }
      } catch (error) {
        if (!disposed) {
          setShortcutStatus(
            error instanceof Error ? error.message : "Could not register that shortcut.",
          );
        }
      }
    }

    void syncShortcut();

    return () => {
      disposed = true;
    };
  }, [settings.shortcut]);

  async function chooseNotebookFolder() {
    try {
      await setPanelAutoHide(false);
      const selected = await open({
        defaultPath: settings.notebookPath ?? undefined,
        directory: true,
        multiple: false,
        title: "Choose your mdbar notebook folder",
      });

      if (typeof selected === "string") {
        setSettings((existing) => ({
          ...existing,
          notebookPath: selected,
        }));
        setMode("daily");
        setErrorMessage(null);
        setIsSettingsOpen(false);
      }
    } finally {
      await setPanelAutoHide(true);
    }
  }

  function openComposer(kind: ComposerKind) {
    setComposerKind(kind);
    setNewItemName("");
    setIsComposerOpen(true);
  }

  async function handleCreateNote() {
    if (!settings.notebookPath || !newItemName.trim()) {
      return;
    }

    try {
      const note = await createLibraryNote(settings.notebookPath, newItemName.trim());
      const notes = await listLibraryNotes(settings.notebookPath);

      setLibraryNotes(notes);
      setMode("library");
      setSelectedLibraryNoteId(note.id);
      setCurrentNote(note);
      setDraft(note.content);
      setSaveState("idle");
      setErrorMessage(null);
      setNewItemName("");
      setIsComposerOpen(false);
      setIsNotePickerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCreateFolder() {
    if (!settings.notebookPath || !newItemName.trim()) {
      return;
    }

    try {
      await createLibraryFolder(settings.notebookPath, newItemName.trim());
      const notes = await listLibraryNotes(settings.notebookPath);

      setLibraryNotes(notes);
      setMode("library");
      setSaveState("idle");
      setErrorMessage(null);
      setNewItemName("");
      setIsComposerOpen(false);
      setIsNotePickerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handlePrevious() {
    if (mode === "daily") {
      setDailyDateKey((current) => shiftDateKey(current, -1));
    }
  }

  function handleNext() {
    if (mode === "daily" && dailyDateKey < todayDateKey) {
      setDailyDateKey((current) => shiftDateKey(current, 1));
    }
  }

  function handleComposerSubmit() {
    if (composerKind === "folder") {
      void handleCreateFolder();
      return;
    }

    void handleCreateNote();
  }

  function handleNotesButtonClick() {
    setMode("library");
    if (libraryNotes.length > 0) {
      setIsNotePickerOpen((current) => !current);
    }
  }

  return (
    <main className={`app-shell ${appearance === "dark" ? "theme-dark" : "theme-light"}`}>
      <section className="panel-frame">
        <header className="panel-header">
          <div className="header-side">
            <button
              aria-label="Previous day"
              className="header-icon"
              disabled={disablePrevious}
              onClick={handlePrevious}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="m14.5 6.5-5 5 5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              </svg>
            </button>

            <button
              aria-label="Go to today"
              className={`header-icon${mode === "daily" ? " active" : ""}`}
              onClick={() => {
                setMode("daily");
                setDailyDateKey(todayDateKey);
              }}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M7 4.5v2.2M17 4.5v2.2M5.5 8.2h13M6.3 6.5h11.4a.8.8 0 0 1 .8.8v10a1.2 1.2 0 0 1-1.2 1.2H6.7a1.2 1.2 0 0 1-1.2-1.2v-10a.8.8 0 0 1 .8-.8Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.45"
                />
                <path
                  d="m10 13 2 2 3.5-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.45"
                />
              </svg>
            </button>

            <button
              aria-label="Next day"
              className="header-icon"
              disabled={disableNext}
              onClick={handleNext}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="m9.5 6.5 5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              </svg>
            </button>
          </div>

          <h1 className="header-title" title={title}>
            {title}
          </h1>

          <div className="header-side header-side-right">
            <div className="header-menu-wrap" ref={notePickerRef}>
              <button
                aria-expanded={isNotePickerOpen}
                aria-label="Open notes"
                className={`header-icon${mode === "library" ? " active" : ""}`}
                onClick={handleNotesButtonClick}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M7.2 6.25h6.1l3.45 3.4v7.15A1.2 1.2 0 0 1 15.55 18H7.2A1.2 1.2 0 0 1 6 16.8v-9.35a1.2 1.2 0 0 1 1.2-1.2Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.45"
                  />
                  <path
                    d="M13.3 6.25v3.4h3.45M8.7 12.2h5.1M8.7 14.8h5.1"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.45"
                  />
                </svg>
              </button>

              {isNotePickerOpen ? (
                <div className="note-picker-popover note-picker-popover-header">
                  <div className="note-picker-popover-copy">
                    <p className="empty-kicker">Notes</p>
                    <p className="sheet-subcopy">Browse markdown files inside <code>notes/</code>.</p>
                  </div>
                  <div className="note-picker-popover-actions">
                    <button
                      className="toolbar-button"
                      onClick={() => openComposer("note")}
                      type="button"
                    >
                      New note
                    </button>
                    <button
                      className="toolbar-button"
                      onClick={() => openComposer("folder")}
                      type="button"
                    >
                      New folder
                    </button>
                  </div>
                  {libraryNotes.length === 0 ? (
                    <p className="note-picker-empty">No notes yet.</p>
                  ) : (
                    libraryNotes.map((note) => (
                      <button
                        className={`note-picker-item${
                          selectedLibraryNoteId === note.id ? " is-active" : ""
                        }`}
                        key={note.id}
                        onClick={() => {
                          setSelectedLibraryNoteId(note.id);
                          setMode("library");
                          setIsNotePickerOpen(false);
                        }}
                        type="button"
                      >
                        <span className="note-picker-item-row">
                          <span className="note-picker-item-icon" aria-hidden="true">
                            {note.relativePath.includes("/") ? "↳" : "•"}
                          </span>
                          <span className="note-picker-item-title">{note.title}</span>
                        </span>
                        <span className="note-picker-item-meta">
                          {getNoteFolderLabel(note.relativePath)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <button
              aria-label="Open settings"
              className="header-icon"
              onClick={() => setIsSettingsOpen(true)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M12 4.8a1 1 0 0 1 1-.96h.22a1 1 0 0 1 .96.78l.28 1.27c.1.43.43.74.84.89.2.08.4.17.6.28.38.2.83.22 1.22.02l1.14-.56a1 1 0 0 1 1.2.22l.16.18a1 1 0 0 1 .08 1.2l-.78 1.04a1.3 1.3 0 0 0-.24 1.18c.04.22.06.45.06.68s-.02.46-.06.68c-.08.42 0 .86.24 1.18l.78 1.04a1 1 0 0 1-.08 1.2l-.16.18a1 1 0 0 1-1.2.22l-1.14-.56a1.3 1.3 0 0 0-1.22.02c-.2.11-.4.2-.6.28-.41.15-.74.46-.84.89l-.28 1.27a1 1 0 0 1-.96.78H13a1 1 0 0 1-1-.96l-.08-1.3a1.3 1.3 0 0 0-.62-1.03 5.6 5.6 0 0 1-.52-.32 1.3 1.3 0 0 0-1.26-.1l-1.2.42a1 1 0 0 1-1.14-.34l-.14-.2a1 1 0 0 1 .06-1.2l.82-.98c.28-.34.4-.8.34-1.24a5.8 5.8 0 0 1 0-1.38c.06-.44-.06-.9-.34-1.24l-.82-.98a1 1 0 0 1-.06-1.2l.14-.2a1 1 0 0 1 1.14-.34l1.2.42c.42.15.88.1 1.26-.1.17-.12.35-.22.52-.32.36-.22.58-.6.62-1.03L12 4.8Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.15"
                />
                <circle
                  cx="12"
                  cy="12"
                  fill="none"
                  r="2.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
            </button>
          </div>
        </header>

        {!settings.notebookPath ? (
          <section className="empty-state onboarding-state">
            <p className="empty-kicker">Welcome to mdbar</p>
            <h2>Choose one folder on your Mac and mdbar turns it into a plain markdown notebook.</h2>
            <p>
              Nothing is locked into a database. The first time you open a date, mdbar creates that
              day&apos;s file in <code>daily/</code>. Everything else lives in <code>notes/</code>,
              including folders you create yourself.
            </p>

            <div className="onboarding-grid">
              <article className="onboarding-card">
                <span className="onboarding-step">1</span>
                <h3>Pick a folder</h3>
                <p>Choose any empty or existing directory as the root of your notebook.</p>
              </article>
              <article className="onboarding-card">
                <span className="onboarding-step">2</span>
                <h3>Daily notes stay dated</h3>
                <p>Click the calendar to jump back to today. The arrows move between dates.</p>
              </article>
              <article className="onboarding-card">
                <span className="onboarding-step">3</span>
                <h3>Notes can be organized</h3>
                <p>Create folders inside <code>notes/</code> and mdbar will browse them recursively.</p>
              </article>
            </div>

            <div className="onboarding-tree-card">
              <p className="field-label">Folder structure</p>
              <pre className="onboarding-tree">{onboardingTree}</pre>
            </div>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={chooseNotebookFolder} type="button">
                Choose notebook folder
              </button>
            </div>
          </section>
        ) : (
          <section className="panel-body">
            {errorMessage ? <p className="inline-message error">{errorMessage}</p> : null}

            {mode === "library" && libraryNotes.length === 0 ? (
              <div className="editor-empty-state">
                <p className="empty-kicker">No side notes yet</p>
                <h2>Create markdown files or folders in <code>notes/</code> and mdbar will pick them up automatically.</h2>
                <p>
                  Use folders for projects, clients, or archives. mdbar will browse through nested
                  directories and show the relative path in the picker.
                </p>
                <div className="empty-actions">
                  <button className="primary-button" onClick={() => openComposer("note")} type="button">
                    Create a note
                  </button>
                  <button className="secondary-button" onClick={() => openComposer("folder")} type="button">
                    Create a folder
                  </button>
                </div>
              </div>
            ) : currentNote ? (
              <Suspense
                fallback={
                  <div className="editor-empty-state">
                    <p className="empty-kicker">Loading editor</p>
                    <h2>Preparing the markdown editor.</h2>
                  </div>
                }
              >
                <InkMarkdownEditor
                  documentKey={editorDocumentKey}
                  isLoading={isLoadingNote}
                  onChange={setDraft}
                  style={
                    {
                      "--editor-font-family": editorFontFamily,
                      "--editor-font-size": `${settings.fontSize}px`,
                      "--editor-line-height": `${settings.lineHeight}`,
                    } as CSSProperties
                  }
                  value={draft}
                />
              </Suspense>
            ) : (
              <div className="editor-empty-state">
                <p className="empty-kicker">{isLoadingNote ? "Loading note" : "Nothing selected"}</p>
                <h2>
                  {isLoadingNote
                    ? "Preparing your markdown file."
                    : "Choose a note or pick a notebook folder to continue."}
                </h2>
              </div>
            )}
          </section>
        )}
      </section>

      {isComposerOpen ? (
        <div className="sheet-backdrop" onClick={() => setIsComposerOpen(false)} role="presentation">
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <p className="empty-kicker">
              {composerKind === "folder" ? "New folder" : "New note"}
            </p>
            <h2>
              {composerKind === "folder"
                ? "Create a folder inside notes/."
                : "Create a plain markdown file in your notes folder."}
            </h2>
            <label className="field-label" htmlFor="new-item-name">
              {composerKind === "folder" ? "Folder name" : "Title"}
            </label>
            <input
              autoFocus
              id="new-item-name"
              onChange={(event) => setNewItemName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleComposerSubmit();
                }
              }}
              placeholder={composerKind === "folder" ? "projects/client" : "Project brief"}
              type="text"
              value={newItemName}
            />
            <p className="field-hint">
              {composerKind === "folder"
                ? "Use a path like projects/client to create nested folders inside notes/."
                : "Create the note here, then move it into folders inside notes/ whenever you want."}
            </p>
            <div className="composer-actions">
              <button
                className="secondary-button"
                onClick={() => setIsComposerOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="primary-button" onClick={handleComposerSubmit} type="button">
                {composerKind === "folder" ? "Create folder" : "Create note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SettingsSheet
        onChange={(patch) => setSettings((existing) => ({ ...existing, ...patch }))}
        onChooseFolder={chooseNotebookFolder}
        onClose={() => setIsSettingsOpen(false)}
        open={isSettingsOpen}
        settings={settings}
        shortcutStatus={shortcutStatus}
      />
    </main>
  );
}

export default App;
