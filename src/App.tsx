import { open } from "@tauri-apps/plugin-dialog";
import {
  isRegistered,
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { InkMarkdownEditor } from "./components/InkMarkdownEditor";
import { SettingsSheet } from "./components/SettingsSheet";
import { formatDateLabel, shiftDateKey, todayKey } from "./lib/dates";
import { loadSettings, saveSettings } from "./lib/settings";
import {
  createLibraryNote,
  listLibraryNotes,
  openDailyNote,
  openLibraryNote,
  openNoteInDefaultApp,
  revealNoteInFinder,
  saveNote,
  setPanelAutoHide,
  toggleMainWindow,
} from "./lib/tauri";
import type { AppSettings, NoteDocument, NoteSummary } from "./lib/types";
import "./App.css";

function resolveInitialSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function noteCaption(note: NoteDocument | null) {
  return note?.relativePath ?? "No file selected";
}

function saveStateLabel(
  saveState: "idle" | "saving" | "saved",
  isLoadingNote: boolean,
  errorMessage: string | null,
) {
  if (errorMessage) {
    return "Issue";
  }

  if (isLoadingNote) {
    return "Loading";
  }

  if (saveState === "saving") {
    return "Saving";
  }

  if (saveState === "saved") {
    return "Saved";
  }

  return "Ready";
}

const onboardingTree = `your-notebook/
  daily/
    2026-04-18.md
    2026-04-19.md
  notes/
    ideas.md
    projects/
      mdbar-roadmap.md`;

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [mode, setMode] = useState<"daily" | "library">("daily");
  const [dailyDateKey, setDailyDateKey] = useState(todayKey);
  const [libraryNotes, setLibraryNotes] = useState<NoteSummary[]>([]);
  const [selectedLibraryNoteId, setSelectedLibraryNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<NoteDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [shortcutStatus, setShortcutStatus] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isNotePickerOpen, setIsNotePickerOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    resolveInitialSystemTheme,
  );
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
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
    if (!isActionMenuOpen && !isNotePickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!actionMenuRef.current?.contains(target)) {
        setIsActionMenuOpen(false);
      }

      if (!notePickerRef.current?.contains(target)) {
        setIsNotePickerOpen(false);
      }
    };

    const handleWindowBlur = () => {
      setIsActionMenuOpen(false);
      setIsNotePickerOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isActionMenuOpen, isNotePickerOpen]);

  useEffect(() => {
    setIsActionMenuOpen(false);
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
  const selectedLibraryIndex = selectedLibraryNoteId
    ? libraryNotes.findIndex((note) => note.id === selectedLibraryNoteId)
    : -1;
  const title = mode === "daily" ? formatDateLabel(dailyDateKey) : currentNote?.title ?? "Notes";
  const statusLabel = saveStateLabel(saveState, isLoadingNote, errorMessage);
  const disablePrevious =
    !settings.notebookPath || (mode === "library" && selectedLibraryIndex <= 0);
  const disableNext =
    !settings.notebookPath ||
    (mode === "daily"
      ? dailyDateKey >= todayDateKey
      : selectedLibraryIndex === -1 || selectedLibraryIndex >= libraryNotes.length - 1);

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

  async function handleCreateNote() {
    if (!settings.notebookPath || !newNoteTitle.trim()) {
      return;
    }

    try {
      const note = await createLibraryNote(settings.notebookPath, newNoteTitle.trim());
      const notes = await listLibraryNotes(settings.notebookPath);

      setLibraryNotes(notes);
      setMode("library");
      setSelectedLibraryNoteId(note.id);
      setCurrentNote(note);
      setDraft(note.content);
      setSaveState("idle");
      setErrorMessage(null);
      setNewNoteTitle("");
      setIsComposerOpen(false);
      setIsNotePickerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleOpenCurrentInDefaultApp() {
    if (!currentNote) {
      return;
    }

    setIsActionMenuOpen(false);
    await openNoteInDefaultApp(currentNote.filePath);
  }

  async function handleRevealCurrentInFinder() {
    if (!currentNote) {
      return;
    }

    setIsActionMenuOpen(false);
    await revealNoteInFinder(currentNote.filePath);
  }

  function handlePrevious() {
    if (mode === "daily") {
      setDailyDateKey((current) => shiftDateKey(current, -1));
      return;
    }

    if (selectedLibraryIndex > 0) {
      setSelectedLibraryNoteId(libraryNotes[selectedLibraryIndex - 1].id);
    }
  }

  function handleNext() {
    if (mode === "daily") {
      if (dailyDateKey < todayDateKey) {
        setDailyDateKey((current) => shiftDateKey(current, 1));
      }
      return;
    }

    if (selectedLibraryIndex > -1 && selectedLibraryIndex < libraryNotes.length - 1) {
      setSelectedLibraryNoteId(libraryNotes[selectedLibraryIndex + 1].id);
    }
  }

  return (
    <main className={`app-shell ${appearance === "dark" ? "theme-dark" : "theme-light"}`}>
      <section className="panel-frame">
        <header className="panel-header">
          <div className="header-side">
            <button
              aria-label={mode === "daily" ? "Previous day" : "Previous note"}
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
              aria-label="Jump to today"
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
              aria-label={mode === "daily" ? "Next day" : "Next note"}
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
            <div className="header-menu-wrap" ref={actionMenuRef}>
              <div className={`header-split-button${isActionMenuOpen ? " active" : ""}`}>
                <button
                  aria-label="Open current note"
                  className="header-split-button-primary"
                  disabled={!currentNote}
                  onClick={() => void handleOpenCurrentInDefaultApp()}
                  type="button"
                >
                  <span aria-hidden="true" className="header-split-button-mark">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M8 5.75h6.4L18.25 9.6V18a1.25 1.25 0 0 1-1.25 1.25H8A1.25 1.25 0 0 1 6.75 18V7A1.25 1.25 0 0 1 8 5.75Z"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.4"
                      />
                      <path
                        d="M14.25 5.75V9.6h3.85"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </span>
                </button>
                <button
                  aria-expanded={isActionMenuOpen}
                  aria-label="Open note actions"
                  className="header-split-button-toggle"
                  disabled={!currentNote}
                  onClick={() => setIsActionMenuOpen((current) => !current)}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path
                      d="m8 10 4 4 4-4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                    />
                  </svg>
                </button>
              </div>

              {isActionMenuOpen ? (
                <div className="header-menu-dropdown">
                  <button
                    className="header-menu-item"
                    onClick={() => void handleRevealCurrentInFinder()}
                    type="button"
                  >
                    Reveal in Finder
                  </button>
                  <button
                    className="header-menu-item"
                    onClick={() => {
                      setIsActionMenuOpen(false);
                      setMode("daily");
                      setDailyDateKey(todayDateKey);
                    }}
                    type="button"
                  >
                    Go to today
                  </button>
                  <button
                    className="header-menu-item"
                    onClick={() => {
                      setIsActionMenuOpen(false);
                      setMode("library");
                    }}
                    type="button"
                  >
                    Browse notes
                  </button>
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
                  d="M10.1 4.6c.2-.8 1.4-.8 1.6 0l.3 1.4a1 1 0 0 0 .8.7l1.4.2c.8.1 1.1 1.1.5 1.6l-1.1 1a1 1 0 0 0-.3 1l.3 1.4c.2.8-.7 1.4-1.4.9l-1.2-.8a1 1 0 0 0-1.1 0l-1.2.8c-.7.5-1.6-.1-1.4-.9l.3-1.4a1 1 0 0 0-.3-1l-1.1-1c-.6-.5-.3-1.5.5-1.6l1.4-.2a1 1 0 0 0 .8-.7l.3-1.4Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.35"
                />
                <circle
                  cx="10.9"
                  cy="10.5"
                  fill="none"
                  r="2.2"
                  stroke="currentColor"
                  strokeWidth="1.35"
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
                <p>Each date maps to its own markdown file inside <code>daily/</code>.</p>
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
            <div className="panel-toolbar">
              <div className="view-switch">
                <button
                  className={mode === "daily" ? "is-active" : ""}
                  onClick={() => setMode("daily")}
                  type="button"
                >
                  Daily
                </button>
                <button
                  className={mode === "library" ? "is-active" : ""}
                  onClick={() => setMode("library")}
                  type="button"
                >
                  Notes
                </button>
              </div>

              <div className="panel-toolbar-center">
                {mode === "library" ? (
                  <div className="note-picker" ref={notePickerRef}>
                    <button
                      aria-expanded={isNotePickerOpen}
                      className={`note-picker-trigger${isNotePickerOpen ? " is-open" : ""}`}
                      disabled={libraryNotes.length === 0}
                      onClick={() => setIsNotePickerOpen((current) => !current)}
                      type="button"
                    >
                      <span className="note-picker-trigger-label">
                        {currentNote?.title ?? "Choose a note"}
                      </span>
                      <span className="note-picker-trigger-meta">
                        {currentNote?.relativePath ?? "Browse your notes folder"}
                      </span>
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path
                          d="m8 10 4 4 4-4"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.6"
                        />
                      </svg>
                    </button>

                    {isNotePickerOpen ? (
                      <div className="note-picker-popover">
                        {libraryNotes.map((note) => (
                          <button
                            className={`note-picker-item${
                              selectedLibraryNoteId === note.id ? " is-active" : ""
                            }`}
                            key={note.id}
                            onClick={() => {
                              setSelectedLibraryNoteId(note.id);
                              setIsNotePickerOpen(false);
                            }}
                            type="button"
                          >
                            <span className="note-picker-item-title">{note.title}</span>
                            <span className="note-picker-item-meta">{note.relativePath}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="note-caption">{noteCaption(currentNote)}</p>
                )}
              </div>

              <div className="panel-toolbar-actions">
                {mode === "library" ? (
                  <button
                    className="toolbar-button"
                    onClick={() => setIsComposerOpen(true)}
                    type="button"
                  >
                    New
                  </button>
                ) : null}
                <p className={`status-pill${statusLabel === "Issue" ? " is-error" : ""}`}>
                  {statusLabel}
                </p>
              </div>
            </div>

            {errorMessage ? <p className="inline-message error">{errorMessage}</p> : null}

            {mode === "library" && libraryNotes.length === 0 ? (
              <div className="editor-empty-state">
                <p className="empty-kicker">No side notes yet</p>
                <h2>Create markdown files in <code>notes/</code> and mdbar will pick them up automatically.</h2>
                <p>
                  You can also create folders inside <code>notes/</code> to organize projects,
                  areas, or archives.
                </p>
                <button className="primary-button" onClick={() => setIsComposerOpen(true)} type="button">
                  Create a note
                </button>
              </div>
            ) : currentNote ? (
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
            <p className="empty-kicker">New note</p>
            <h2>Create a plain markdown file in your notes folder.</h2>
            <label className="field-label" htmlFor="new-note-title">
              Title
            </label>
            <input
              autoFocus
              id="new-note-title"
              onChange={(event) => setNewNoteTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleCreateNote();
                }
              }}
              placeholder="Project brief"
              type="text"
              value={newNoteTitle}
            />
            <p className="field-hint">
              For subfolders, create them directly inside <code>notes/</code> and mdbar will browse
              them automatically.
            </p>
            <div className="composer-actions">
              <button
                className="secondary-button"
                onClick={() => setIsComposerOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="primary-button" onClick={handleCreateNote} type="button">
                Create note
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
