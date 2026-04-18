import { open } from "@tauri-apps/plugin-dialog";
import {
  isRegistered,
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { formatDistanceToNowStrict } from "date-fns";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";

import { HybridEditor } from "./components/HybridEditor";
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
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [shortcutStatus, setShortcutStatus] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef<number | null>(null);
  const notePathRef = useRef<string | null>(null);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const appearance =
    settings.theme === "system" ? "auto" : settings.theme === "dark" ? "dark" : "light";

  const editorFontFamily =
    settings.fontFamily === "editorial"
      ? '"Iowan Old Style", "Palatino Linotype", Georgia, serif'
      : settings.fontFamily === "mono"
        ? '"SF Mono", "JetBrains Mono", Menlo, monospace'
        : '"Avenir Next", "Helvetica Neue", sans-serif';
  const editorDocumentKey =
    currentNote?.filePath ??
    `${mode}:${dailyDateKey}:${selectedLibraryNoteId ?? "no-library-note"}`;

  const refreshLibrary = useEffectEvent(async (folderPath: string) => {
    const notes = await listLibraryNotes(folderPath);
    startTransition(() => {
      setLibraryNotes(notes);
      if (!selectedLibraryNoteId && notes[0]) {
        setSelectedLibraryNoteId(notes[0].id);
      }
    });
  });

  const loadDaily = useEffectEvent(async (folderPath: string, dateKey: string) => {
    const note = await openDailyNote(folderPath, dateKey);
    notePathRef.current = note.filePath;
    startTransition(() => {
      setCurrentNote(note);
      setDraft(note.content);
      setErrorMessage(null);
      setSaveState("idle");
    });
  });

  const loadLibrary = useEffectEvent(async (folderPath: string, noteId: string) => {
    const note = await openLibraryNote(folderPath, noteId);
    notePathRef.current = note.filePath;
    startTransition(() => {
      setCurrentNote(note);
      setDraft(note.content);
      setErrorMessage(null);
      setSaveState("idle");
    });
  });

  useEffect(() => {
    if (!settings.notebookPath) {
      setCurrentNote(null);
      setLibraryNotes([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await refreshLibrary(settings.notebookPath!);

        if (cancelled) {
          return;
        }

        if (mode === "daily") {
          await loadDaily(settings.notebookPath!, dailyDateKey);
          return;
        }

        if (selectedLibraryNoteId) {
          await loadLibrary(settings.notebookPath!, selectedLibraryNoteId);
          return;
        }

        setCurrentNote(null);
        setDraft("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    dailyDateKey,
    loadDaily,
    loadLibrary,
    mode,
    refreshLibrary,
    selectedLibraryNoteId,
    settings.notebookPath,
  ]);

  useEffect(() => {
    if (!currentNote || draft === currentNote.content) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await saveNote(currentNote.filePath, draft);

        startTransition(() => {
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
        });
      } catch (error) {
        setSaveState("idle");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }, 420);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [currentNote, draft]);

  useEffect(() => {
    let disposed = false;

    const syncShortcut = async () => {
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
    };

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
      setMode("library");
      setSelectedLibraryNoteId(note.id);
      setCurrentNote(note);
      setDraft(note.content);
      setNewNoteTitle("");
      setIsComposerOpen(false);
      await refreshLibrary(settings.notebookPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleOpenCurrentInDefaultApp() {
    if (!currentNote) {
      return;
    }

    await openNoteInDefaultApp(currentNote.filePath);
  }

  async function handleRevealCurrentInFinder() {
    if (!currentNote) {
      return;
    }

    await revealNoteInFinder(currentNote.filePath);
  }

  return (
    <main className={`app-shell theme-${appearance}`}>
      <section className="window-frame">
        <header className="topbar">
          <div>
            <p className="eyebrow">mdbar</p>
            <h1>{mode === "daily" ? formatDateLabel(dailyDateKey) : currentNote?.title ?? "Notes"}</h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" onClick={handleOpenCurrentInDefaultApp} type="button">
              Open
            </button>
            <button className="secondary-button" onClick={handleRevealCurrentInFinder} type="button">
              Reveal
            </button>
            <button className="secondary-button" onClick={() => setIsSettingsOpen(true)} type="button">
              Settings
            </button>
          </div>
        </header>

        {!settings.notebookPath ? (
          <section className="empty-state">
            <p className="eyebrow">Plain files. No lock-in.</p>
            <h2>Choose one folder and mdbar turns it into your daily notebook.</h2>
            <p>
              Daily notes live in <code>daily/</code>. Everything else lives in{" "}
              <code>notes/</code>.
            </p>
            <button className="primary-button" onClick={chooseNotebookFolder} type="button">
              Choose notebook folder
            </button>
          </section>
        ) : (
          <div className="workspace">
            <aside className="sidebar">
              <div className="sidebar-group">
                <div className="sidebar-title-row">
                  <span className="sidebar-title">Daily</span>
                  <input
                    onChange={(event) => {
                      setMode("daily");
                      setDailyDateKey(event.currentTarget.value);
                    }}
                    type="date"
                    value={dailyDateKey}
                  />
                </div>
                <div className="daily-nav">
                  <button
                    className={mode === "daily" && dailyDateKey === shiftDateKey(todayKey(), -1) ? "is-active" : ""}
                    onClick={() => {
                      setMode("daily");
                      setDailyDateKey(shiftDateKey(todayKey(), -1));
                    }}
                    type="button"
                  >
                    Yesterday
                  </button>
                  <button
                    className={mode === "daily" && dailyDateKey === todayKey() ? "is-active" : ""}
                    onClick={() => {
                      setMode("daily");
                      setDailyDateKey(todayKey());
                    }}
                    type="button"
                  >
                    Today
                  </button>
                  <button
                    className={mode === "daily" && dailyDateKey === shiftDateKey(todayKey(), 1) ? "is-active" : ""}
                    onClick={() => {
                      setMode("daily");
                      setDailyDateKey(shiftDateKey(todayKey(), 1));
                    }}
                    type="button"
                  >
                    Tomorrow
                  </button>
                </div>
              </div>

              <div className="sidebar-group">
                <div className="sidebar-title-row">
                  <span className="sidebar-title">Notes</span>
                  <button className="ghost-button" onClick={() => setIsComposerOpen(true)} type="button">
                    New
                  </button>
                </div>
                <div className="note-list">
                  {libraryNotes.length === 0 ? (
                    <p className="sidebar-empty">No regular notes yet.</p>
                  ) : (
                    libraryNotes.map((note) => (
                      <button
                        className={`note-list-item${selectedLibraryNoteId === note.id && mode === "library" ? " is-active" : ""}`}
                        key={note.id}
                        onClick={() => {
                          setMode("library");
                          setSelectedLibraryNoteId(note.id);
                        }}
                        type="button"
                      >
                        <span>{note.title}</span>
                        <small>{formatDistanceToNowStrict(note.updatedAtMs, { addSuffix: true })}</small>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </aside>

            <section className="editor-panel">
              <div className="editor-meta">
                <div>
                  <span className="meta-label">{currentNote?.kind === "daily" ? "Daily note" : "Library note"}</span>
                  <p className="meta-value">{currentNote?.filePath ?? "No file selected"}</p>
                </div>
                <div className="meta-status">
                  {isPending ? <span>Loading…</span> : null}
                  {!isEditorReady ? <span>Editor booting…</span> : null}
                  <span>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Idle"}</span>
                </div>
              </div>
              <div className="editor-card">
                <HybridEditor
                  appearance={appearance}
                  documentKey={editorDocumentKey}
                  fontFamily={editorFontFamily}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  onChange={setDraft}
                  onReadyChange={setIsEditorReady}
                  placeholder="Start with today's headline, your task list, or a rough thought."
                  readOnly={!currentNote}
                  value={draft}
                />
              </div>
              {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
            </section>
          </div>
        )}
      </section>

      {isComposerOpen ? (
        <div className="sheet-backdrop" onClick={() => setIsComposerOpen(false)} role="presentation">
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">New note</p>
            <h2>Name it once. The file stays plain markdown.</h2>
            <input
              autoFocus
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
            <div className="composer-actions">
              <button className="secondary-button" onClick={() => setIsComposerOpen(false)} type="button">
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
