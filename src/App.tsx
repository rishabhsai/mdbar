import { open } from "@tauri-apps/plugin-dialog";
import {
  isRegistered,
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { SettingsView } from "./components/SettingsSheet";
import { InkMarkdownEditor } from "./components/InkMarkdownEditor";
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
type Screen = "daily" | "library" | "settings";

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

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("daily");
  const [dailyDateKey, setDailyDateKey] = useState(todayKey);
  const [libraryNotes, setLibraryNotes] = useState<NoteSummary[]>([]);
  const [selectedLibraryNoteId, setSelectedLibraryNoteId] = useState<string | null>(
    () => loadSettings().lastLibraryNoteId,
  );
  const [currentNote, setCurrentNote] = useState<NoteDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [shortcutStatus, setShortcutStatus] = useState<string | null>(null);
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
  }, [screen, dailyDateKey, selectedLibraryNoteId]);

  const appearance = settings.theme === "system" ? systemTheme : settings.theme;
  const editorFontFamily =
    settings.fontFamily === "editorial"
      ? '"Iowan Old Style", "Palatino Linetype", Georgia, serif'
      : settings.fontFamily === "mono"
        ? '"SF Mono", "JetBrains Mono", Menlo, monospace'
        : '"Avenir Next", "Helvetica Neue", sans-serif';
  const editorDocumentKey =
    currentNote?.filePath ??
    `${screen}:${dailyDateKey}:${selectedLibraryNoteId ?? "no-library-note"}`;
  const todayDateKey = todayKey();
  const title =
    screen === "settings"
      ? "Settings"
      : screen === "daily"
        ? formatDateLabel(dailyDateKey)
        : currentNote?.title ?? "Notes";
  const disablePrevious = !settings.notebookPath || screen !== "daily";
  const disableNext =
    !settings.notebookPath || screen !== "daily" || dailyDateKey >= todayDateKey;

  // Persist the last selected library note
  useEffect(() => {
    if (selectedLibraryNoteId !== settings.lastLibraryNoteId) {
      setSettings((existing) => ({
        ...existing,
        lastLibraryNoteId: selectedLibraryNoteId,
      }));
    }
  }, [selectedLibraryNoteId]);

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

    if (screen === "settings") {
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

        if (screen === "library") {
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
  }, [dailyDateKey, screen, selectedLibraryNoteId, settings.notebookPath]);

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
        setScreen("daily");
        setErrorMessage(null);
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
      setScreen("library");
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
      setScreen("library");
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
    if (screen === "daily") {
      setDailyDateKey((current) => shiftDateKey(current, -1));
    }
  }

  function handleNext() {
    if (screen === "daily" && dailyDateKey < todayDateKey) {
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
    // Click notes icon → go directly to last library note
    if (screen === "library" && !isNotePickerOpen) {
      // Already on library, just open picker
      if (libraryNotes.length > 0) {
        setIsNotePickerOpen(true);
      }
      return;
    }

    setScreen("library");
    // If we have a saved last note ID, use it
    const lastId = settings.lastLibraryNoteId;
    if (lastId && libraryNotes.some((n) => n.id === lastId)) {
      setSelectedLibraryNoteId(lastId);
    } else if (libraryNotes.length > 0) {
      setSelectedLibraryNoteId(libraryNotes[0].id);
    }
  }

  function handleNotesDropdownToggle() {
    // Dropdown chevron → toggle the note picker
    setScreen("library");
    setIsNotePickerOpen((current) => !current);
  }

  function handleSettingsToggle() {
    if (screen === "settings") {
      // Return to last mode
      setScreen("daily");
      return;
    }

    setScreen("settings");
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
              className={`header-icon${screen === "daily" ? " active" : ""}`}
              onClick={() => {
                setScreen("daily");
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
              <div
                className={`header-split-button${screen === "library" ? " active" : ""}${!settings.notebookPath ? " disabled" : ""}`}
              >
                <button
                  aria-label="Open last note"
                  className="header-split-button-primary"
                  disabled={!settings.notebookPath}
                  onClick={handleNotesButtonClick}
                  type="button"
                >
                  <span className="header-split-button-mark">
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
                  </span>
                </button>
                <button
                  aria-expanded={isNotePickerOpen}
                  aria-label="Browse notes"
                  className="header-split-button-toggle"
                  disabled={!settings.notebookPath}
                  onClick={handleNotesDropdownToggle}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path
                      d="m7.5 9.5 4.5 5 4.5-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                    />
                  </svg>
                </button>
              </div>

              {isNotePickerOpen ? (
                <div className="note-picker-popover">
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
                          setScreen("library");
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
              aria-label={screen === "settings" ? "Return to note" : "Open settings"}
              className={`header-icon${screen === "settings" ? " active" : ""}`}
              onClick={handleSettingsToggle}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm9 3.3-.08-.88-2.2-.62a7.35 7.35 0 0 0-.58-1.4l1.1-2-1.76-1.77-2 1.1a7.34 7.34 0 0 0-1.4-.58l-.62-2.2L12 3l-.88.08-.62 2.2c-.49.13-.96.32-1.4.58l-2-1.1-1.77 1.76 1.1 2c-.26.44-.45.91-.58 1.4l-2.2.62L3 12l.08.88 2.2.62c.13.49.32.96.58 1.4l-1.1 2 1.76 1.77 2-1.1c.44.26.91.45 1.4.58l.62 2.2L12 21l.88-.08.62-2.2c.49-.13.96-.32 1.4-.58l2 1.1 1.77-1.76-1.1-2c.26-.44.45-.91.58-1.4l2.2-.62L21 12Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
        ) : screen === "settings" ? (
          <SettingsView
            onChange={(patch) => setSettings((existing) => ({ ...existing, ...patch }))}
            onChooseFolder={chooseNotebookFolder}
            onClose={() => setScreen("daily")}
            settings={settings}
            shortcutStatus={shortcutStatus}
          />
        ) : (
          <section className="panel-body">
            {errorMessage ? <p className="inline-message error">{errorMessage}</p> : null}

            {screen === "library" && libraryNotes.length === 0 ? (
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
              <InkMarkdownEditor
                documentKey={editorDocumentKey}
                isLoading={isLoadingNote}
                onChange={setDraft}
                theme={appearance}
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
    </main>
  );
}

export default App;
