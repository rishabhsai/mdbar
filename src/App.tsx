import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { SettingsView } from "./components/SettingsSheet";
import { InkMarkdownEditor } from "./components/InkMarkdownEditor";
import { LibraryView } from "./components/LibraryView";
import { formatDateLabel, shiftDateKey, todayKey } from "./lib/dates";
import { loadSettings, saveSettings } from "./lib/settings";
import {
  deleteNote,
  createLibraryFolder,
  createLibraryNote,
  deleteLibraryFolder,
  listLibraryFolders,
  listLibraryNotes,
  hideMainWindow,
  openDailyNote,
  openLibraryNote,
  renameLibraryNote,
  saveNote,
  setPanelAutoHide,
  syncGlobalShortcut,
} from "./lib/tauri";
import type {
  AppSettings,
  FolderSummary,
  NoteDocument,
  NoteSummary,
} from "./lib/types";
import "./App.css";

type ComposerKind = "note" | "folder";
type Screen = "daily" | "library" | "library-editor" | "settings";
type NavigationSnapshot = {
  dailyDateKey: string;
  screen: Screen;
  selectedLibraryNoteId: string | null;
};

function resolveInitialSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function editorFontStack(fontFamily: string) {
  const sanitized = fontFamily.replace(/"/g, '\\"');

  if (/mono|code|menlo|sf mono|jetbrains/i.test(fontFamily)) {
    return `"${sanitized}", var(--mono)`;
  }

  if (/serif|georgia|garamond|palatino|iowan|times|baskerville/i.test(fontFamily)) {
    return `"${sanitized}", var(--display)`;
  }

  return `"${sanitized}", var(--sans)`;
}

function describeShortcutError(error: unknown, shortcut: string) {
  const message = error instanceof Error ? error.message : String(error);

  if (/unrecognized|invalid accelerator|invalid shortcut/i.test(message)) {
    return `mdbar couldn't parse "${shortcut}". Try letters, numbers, arrows, space, or function keys.`;
  }

  if (/already|taken|in use|failed to register/i.test(message)) {
    return `That shortcut is already taken by macOS or another app. Try a different combo.`;
  }

  return message || "Could not register that shortcut.";
}

const onboardingTree = `your-notebook/
  daily/
    2026-04-18.md
    2026-04-19.md
  notes/
    ideas.md
    projects/
      mdbar-roadmap.md`;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("daily");
  const [dailyDateKey, setDailyDateKey] = useState(todayKey);
  const [screenHistory, setScreenHistory] = useState<NavigationSnapshot[]>([]);
  const [libraryFolders, setLibraryFolders] = useState<FolderSummary[]>([]);
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
  const [newItemName, setNewItemName] = useState("");
  const [pendingDeleteNote, setPendingDeleteNote] = useState<NoteSummary | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<FolderSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    resolveInitialSystemTheme,
  );
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [editorFocusToken, setEditorFocusToken] = useState(0);
  const saveTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleRenameInFlightRef = useRef(false);

  function currentSnapshot(): NavigationSnapshot {
    return {
      dailyDateKey,
      screen,
      selectedLibraryNoteId,
    };
  }

  function applyNavigationSnapshot(
    snapshot: NavigationSnapshot,
    { focusEditor = false }: { focusEditor?: boolean } = {},
  ) {
    setScreen(snapshot.screen);
    setDailyDateKey(snapshot.dailyDateKey);
    setSelectedLibraryNoteId(snapshot.selectedLibraryNoteId);

    if (focusEditor && (snapshot.screen === "daily" || snapshot.screen === "library-editor")) {
      setEditorFocusToken((value) => value + 1);
    }
  }

  function navigateTo(
    nextScreen: Screen,
    options: {
      dailyDateKey?: string;
      focusEditor?: boolean;
      pushHistory?: boolean;
      resetHistory?: boolean;
      selectedLibraryNoteId?: string | null;
    } = {},
  ) {
    const nextSnapshot: NavigationSnapshot = {
      dailyDateKey: options.dailyDateKey ?? dailyDateKey,
      screen: nextScreen,
      selectedLibraryNoteId:
        options.selectedLibraryNoteId === undefined
          ? selectedLibraryNoteId
          : options.selectedLibraryNoteId,
    };
    const snapshot = currentSnapshot();
    const isSameDestination =
      snapshot.screen === nextSnapshot.screen &&
      snapshot.dailyDateKey === nextSnapshot.dailyDateKey &&
      snapshot.selectedLibraryNoteId === nextSnapshot.selectedLibraryNoteId;

    if (options.resetHistory) {
      setScreenHistory([]);
    } else if (!isSameDestination && options.pushHistory !== false) {
      setScreenHistory((existing) => [...existing, snapshot]);
    }

    applyNavigationSnapshot(nextSnapshot, {
      focusEditor: options.focusEditor,
    });
  }

  function goBack() {
    const previousSnapshot = screenHistory[screenHistory.length - 1];
    if (!previousSnapshot) {
      return false;
    }

    setScreenHistory((existing) => existing.slice(0, -1));
    applyNavigationSnapshot(previousSnapshot, {
      focusEditor:
        previousSnapshot.screen === "daily" ||
        previousSnapshot.screen === "library-editor",
    });

    return true;
  }

  function resetToTodayNote() {
    setIsComposerOpen(false);
    setPendingDeleteNote(null);
    setPendingDeleteFolder(null);
    setIsRenamingTitle(false);
    setRenamingTitle("");
    navigateTo("daily", {
      dailyDateKey: todayKey(),
      focusEditor: true,
      pushHistory: false,
      resetHistory: true,
    });
  }

  async function refreshNotebookIndex(notebookPath: string) {
    const [folders, notes] = await Promise.all([
      listLibraryFolders(notebookPath),
      listLibraryNotes(notebookPath),
    ]);

    setLibraryFolders(folders);
    setLibraryNotes(notes);

    return { folders, notes };
  }

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

  const appearance = settings.theme === "system" ? systemTheme : settings.theme;
  const editorFontFamily = editorFontStack(settings.fontFamily);
  const editorDocumentKey =
    currentNote?.filePath ??
    `${screen}:${dailyDateKey}:${selectedLibraryNoteId ?? "none"}`;
  const todayDateKey = todayKey();
  const title =
    screen === "settings"
      ? "Settings"
      : screen === "library"
        ? "Notes"
        : screen === "daily"
          ? formatDateLabel(dailyDateKey)
          : currentNote?.title ?? "Note";
  const disablePrevious = !settings.notebookPath || screen !== "daily";
  const disableNext =
    !settings.notebookPath || screen !== "daily" || dailyDateKey > todayDateKey;
  const nextPlansTomorrow =
    Boolean(settings.notebookPath) && screen === "daily" && dailyDateKey === todayDateKey;
  const pendingDeleteFolderNoteCount = pendingDeleteFolder
    ? libraryNotes.filter((note) => noteLivesInFolder(note, pendingDeleteFolder.relativePath)).length
    : 0;
  const pendingDeleteFolderChildCount = pendingDeleteFolder
    ? libraryFolders.filter(
        (folder) =>
          folder.relativePath !== pendingDeleteFolder.relativePath &&
          noteLivesInFolder(folder, pendingDeleteFolder.relativePath),
      ).length
    : 0;
  const pendingDeleteFolderContents = [
    pendingDeleteFolderNoteCount > 0 ? pluralize(pendingDeleteFolderNoteCount, "note") : null,
    pendingDeleteFolderChildCount > 0 ? pluralize(pendingDeleteFolderChildCount, "folder") : null,
  ].filter(Boolean).join(" and ");

  useEffect(() => {
    if (!isRenamingTitle) {
      return;
    }

    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [isRenamingTitle]);

  useEffect(() => {
    if (screen !== "library-editor" || currentNote?.kind !== "library") {
      setIsRenamingTitle(false);
      setRenamingTitle("");
    }
  }, [currentNote?.id, currentNote?.kind, screen]);

  useEffect(() => {
    const unlistenPromise = listen("mdbar://panel-opened", () => {
      resetToTodayNote();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [dailyDateKey, screen, selectedLibraryNoteId]);

  // Persist the last selected library note
  useEffect(() => {
    if (selectedLibraryNoteId !== settings.lastLibraryNoteId) {
      setSettings((existing) => ({
        ...existing,
        lastLibraryNoteId: selectedLibraryNoteId,
      }));
    }
  }, [selectedLibraryNoteId]);

  // Load note content
  useEffect(() => {
    if (!settings.notebookPath) {
      setLibraryFolders([]);
      setLibraryNotes([]);
      setSelectedLibraryNoteId(null);
      setCurrentNote(null);
      setDraft("");
      setErrorMessage(null);
      setSaveState("idle");
      setIsLoadingNote(false);
      return;
    }

    if (screen === "settings" || screen === "library") {
      // Library browser: just load the list, not a note
      if (screen === "library") {
        let cancelled = false;
        void refreshNotebookIndex(settings.notebookPath)
          .then(({ folders, notes }) => {
            if (!cancelled) {
              setLibraryFolders(folders);
              setLibraryNotes(notes);
              setErrorMessage(null);
            }
          })
          .catch((error) => {
            if (!cancelled) {
              setErrorMessage(error instanceof Error ? error.message : String(error));
            }
          });
        return () => { cancelled = true; };
      }
      return;
    }

    let cancelled = false;

    async function syncNotebook() {
      setIsLoadingNote(true);
      setErrorMessage(null);

      try {
        const { folders, notes } = await refreshNotebookIndex(settings.notebookPath!);
        if (cancelled) return;

        setLibraryFolders(folders);
        setLibraryNotes(notes);

        if (screen === "library-editor") {
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
          if (cancelled) return;

          setCurrentNote(note);
          setDraft(note.content);
          setSaveState("idle");
          return;
        }

        const note = await openDailyNote(settings.notebookPath!, dailyDateKey);
        if (cancelled) return;

        setCurrentNote(note);
        setDraft(note.content);
        setSaveState("idle");
      } catch (error) {
        if (cancelled) return;

        setCurrentNote(null);
        setDraft("");
        setSaveState("idle");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setIsLoadingNote(false);
      }
    }

    void syncNotebook();

    return () => { cancelled = true; };
  }, [dailyDateKey, screen, selectedLibraryNoteId, settings.notebookPath]);

  // Auto-save
  useEffect(() => {
    if (isLoadingNote || !currentNote || draft === currentNote.content) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
      const result = await saveNote(currentNote.filePath, draft);

        setCurrentNote((existing) =>
          existing
            ? { ...existing, content: draft, updatedAtMs: result.updatedAtMs }
            : existing,
        );
        setLibraryNotes((existing) =>
          existing.map((note) =>
            note.filePath === currentNote.filePath
              ? { ...note, updatedAtMs: result.updatedAtMs }
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
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [currentNote, draft, isLoadingNote]);

  // Shortcut registration
  useEffect(() => {
    let disposed = false;

    async function syncShortcut() {
      try {
        if (!disposed) {
          const status = await syncGlobalShortcut(settings.shortcut);
          setShortcutStatus(status);
        }
      } catch (error) {
        if (!disposed) {
          setShortcutStatus(describeShortcutError(error, settings.shortcut));
        }
      }
    }

    void syncShortcut();
    return () => { disposed = true; };
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
        setSettings((existing) => ({ ...existing, notebookPath: selected }));
        navigateTo("daily", {
          dailyDateKey: todayKey(),
          focusEditor: true,
          pushHistory: false,
          resetHistory: true,
        });
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
    if (!settings.notebookPath || !newItemName.trim()) return;

    try {
      const note = await createLibraryNote(settings.notebookPath, newItemName.trim());
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);

      setLibraryFolders(folders);
      setLibraryNotes(notes);
      setSelectedLibraryNoteId(note.id);
      setCurrentNote(note);
      setDraft(note.content);
      navigateTo("library-editor", {
        focusEditor: true,
        selectedLibraryNoteId: note.id,
      });
      setSaveState("idle");
      setErrorMessage(null);
      setNewItemName("");
      setIsComposerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCreateFolder() {
    if (!settings.notebookPath || !newItemName.trim()) return;

    try {
      await createLibraryFolder(settings.notebookPath, newItemName.trim());
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);

      setLibraryFolders(folders);
      setLibraryNotes(notes);
      navigateTo("library", {
        pushHistory: false,
      });
      setSaveState("idle");
      setErrorMessage(null);
      setNewItemName("");
      setIsComposerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleComposerSubmit() {
    if (composerKind === "folder") {
      void handleCreateFolder();
    } else {
      void handleCreateNote();
    }
  }

  function handlePrevious() {
    if (screen === "daily") {
      setDailyDateKey((current) => shiftDateKey(current, -1));
    }
  }

  function handleNext() {
    if (screen === "daily" && dailyDateKey <= todayDateKey) {
      setDailyDateKey((current) => shiftDateKey(current, 1));
    }
  }

  function handleNotesClick() {
    if (screen === "library" || screen === "library-editor") {
      if (screen === "library-editor") {
        navigateTo("library");
        return;
      }
      navigateTo("daily", {
        dailyDateKey: todayDateKey,
      });
      return;
    }
    navigateTo("library");
  }

  function handleLibrarySelectNote(noteId: string) {
    setSelectedLibraryNoteId(noteId);
    navigateTo("library-editor", {
      focusEditor: true,
      selectedLibraryNoteId: noteId,
    });
  }

  async function handleQuickCreateNote() {
    if (!settings.notebookPath) return;

    try {
      const note = await createLibraryNote(settings.notebookPath, "");
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);

      setLibraryFolders(folders);
      setLibraryNotes(notes);
      setSelectedLibraryNoteId(note.id);
      setCurrentNote(note);
      setDraft(note.content);
      navigateTo("library-editor", {
        focusEditor: true,
        selectedLibraryNoteId: note.id,
      });
      setSaveState("idle");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCreateNoteInFolder(directory: string) {
    if (!settings.notebookPath) return;

    try {
      const note = await createLibraryNote(settings.notebookPath, "", directory);
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);

      setLibraryFolders(folders);
      setLibraryNotes(notes);
      setSelectedLibraryNoteId(note.id);
      setCurrentNote(note);
      setDraft(note.content);
      navigateTo("library-editor", {
        focusEditor: true,
        selectedLibraryNoteId: note.id,
      });
      setSaveState("idle");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleDeleteCurrentNote() {
    if (!currentNote || currentNote.kind !== "library") return;

    setIsDeleting(false);
    setPendingDeleteNote({
      id: currentNote.id,
      title: currentNote.title,
      filePath: currentNote.filePath,
      relativePath: currentNote.relativePath,
      directory: currentNote.directory,
      updatedAtMs: currentNote.updatedAtMs,
    });
  }

  function requestDeleteNote(note: NoteSummary) {
    setIsDeleting(false);
    setPendingDeleteNote(note);
  }

  function requestDeleteFolder(folder: FolderSummary) {
    setIsDeleting(false);
    setPendingDeleteFolder(folder);
  }

  function startTitleRename() {
    if (screen !== "library-editor" || currentNote?.kind !== "library") {
      return;
    }

    setRenamingTitle(currentNote.title);
    setIsRenamingTitle(true);
  }

  async function submitTitleRename() {
    if (titleRenameInFlightRef.current) {
      return;
    }

    if (
      !settings.notebookPath ||
      !currentNote ||
      currentNote.kind !== "library" ||
      !isRenamingTitle
    ) {
      return;
    }

    const nextTitle = renamingTitle.trim();
    setIsRenamingTitle(false);

    if (!nextTitle || nextTitle === currentNote.title) {
      setRenamingTitle("");
      return;
    }

    try {
      titleRenameInFlightRef.current = true;

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      if (draft !== currentNote.content) {
        await saveNote(currentNote.filePath, draft);
      }

      const renamed = await renameLibraryNote(
        settings.notebookPath,
        currentNote.id,
        nextTitle,
      );
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);

      setLibraryFolders(folders);
      setLibraryNotes(notes);
      setSelectedLibraryNoteId(renamed.id);
      setCurrentNote(renamed);
      setDraft(renamed.content);
      setSaveState("idle");
      setErrorMessage(null);
      setRenamingTitle("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      titleRenameInFlightRef.current = false;
    }
  }

  function noteLivesInFolder(note: NoteDocument | NoteSummary | FolderSummary, folderPath: string) {
    return (
      note.directory === folderPath ||
      note.relativePath.startsWith(`${folderPath}/`)
    );
  }

  async function confirmDeletePendingNote() {
    if (!settings.notebookPath || !pendingDeleteNote || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteNote(pendingDeleteNote.filePath);
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);
      const deletedWasOpen = currentNote?.filePath === pendingDeleteNote.filePath;
      const deletedWasSelected = selectedLibraryNoteId === pendingDeleteNote.id;

      setLibraryFolders(folders);
      setLibraryNotes(notes);

      if (deletedWasSelected) {
        setSelectedLibraryNoteId(null);
      }

      if (deletedWasOpen) {
        setCurrentNote(null);
        setDraft("");
        navigateTo("library", {
          pushHistory: false,
        });
      }

      setPendingDeleteNote(null);
      setSaveState("idle");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }

  async function confirmDeletePendingFolder() {
    if (!settings.notebookPath || !pendingDeleteFolder || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteLibraryFolder(settings.notebookPath, pendingDeleteFolder.relativePath);
      const { folders, notes } = await refreshNotebookIndex(settings.notebookPath);
      const openNoteWasDeleted =
        currentNote?.kind === "library" &&
        noteLivesInFolder(currentNote, pendingDeleteFolder.relativePath);
      const selectedNoteWasDeleted = selectedLibraryNoteId
        ? notes.every((note) => note.id !== selectedLibraryNoteId)
        : false;

      setLibraryFolders(folders);
      setLibraryNotes(notes);

      if (selectedNoteWasDeleted) {
        setSelectedLibraryNoteId(null);
      }

      if (openNoteWasDeleted) {
        setCurrentNote(null);
        setDraft("");
        navigateTo("library", {
          pushHistory: false,
        });
      }

      setPendingDeleteFolder(null);
      setSaveState("idle");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (isRenamingTitle) {
        return;
      }

      if (isDeleting) {
        return;
      }

      event.preventDefault();

      if (isComposerOpen) {
        setIsComposerOpen(false);
        return;
      }

      if (pendingDeleteNote) {
        setPendingDeleteNote(null);
        return;
      }

      if (pendingDeleteFolder) {
        setPendingDeleteFolder(null);
        return;
      }

      if (goBack()) {
        return;
      }

      void hideMainWindow();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isComposerOpen,
    isDeleting,
    isRenamingTitle,
    pendingDeleteFolder,
    pendingDeleteNote,
    screenHistory,
  ]);

  return (
    <main className={`app-shell ${appearance === "dark" ? "theme-dark" : "theme-light"}`}>
      <section className="panel-frame">
        <header className="panel-header">
          <div className="header-side">
            {screen === "library-editor" ? (
              <button
                aria-label="Back to notes"
                className="header-icon"
                onClick={() => navigateTo("library")}
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
            ) : (
              <>
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
                    navigateTo("daily", {
                      dailyDateKey: todayDateKey,
                      focusEditor: true,
                      pushHistory: false,
                      resetHistory: true,
                    });
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
                  aria-label={nextPlansTomorrow ? "Plan tomorrow" : "Next day"}
                  className={`header-icon${nextPlansTomorrow ? " is-muted-clickable" : ""}`}
                  disabled={disableNext}
                  onClick={handleNext}
                  title={nextPlansTomorrow ? "Plan tomorrow" : "Next day"}
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
              </>
            )}
          </div>

          {isRenamingTitle && currentNote?.kind === "library" ? (
            <input
              ref={titleInputRef}
              aria-label="Rename note"
              className="header-title-input"
              onBlur={() => void submitTitleRename()}
              onChange={(event) => setRenamingTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitTitleRename();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsRenamingTitle(false);
                  setRenamingTitle("");
                }
              }}
              type="text"
              value={renamingTitle}
            />
          ) : (
            <h1
              className={`header-title${screen === "library-editor" && currentNote?.kind === "library" ? " is-editable" : ""}`}
              onDoubleClick={() => {
                startTitleRename();
              }}
              title={title}
            >
              {title}
            </h1>
          )}

          <div className="header-side header-side-right">
            <button
              aria-label={
                screen === "library" || screen === "library-editor"
                  ? "Create note"
                  : "Notes"
              }
              className={`header-icon${screen === "library" || screen === "library-editor" ? " active" : ""}`}
              disabled={!settings.notebookPath}
              onClick={() => {
                if (screen === "library" || screen === "library-editor") {
                  void handleQuickCreateNote();
                  return;
                }

                handleNotesClick();
              }}
              type="button"
            >
              {screen === "library" || screen === "library-editor" ? (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M12 5.5v13M5.5 12h13"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.85"
                  />
                </svg>
              ) : (
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
              )}
            </button>

            {screen === "library-editor" && currentNote?.kind === "library" ? (
              <button
                aria-label="Delete note"
                className="header-icon"
                onClick={() => {
                  void handleDeleteCurrentNote();
                }}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M8.2 8.8v8.3M12 8.8v8.3M15.8 8.8v8.3M5.5 6.6h13M9.2 4.8h5.6M7.2 6.6l.5 11a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4l.5-11"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.35"
                  />
                </svg>
              </button>
            ) : null}

            <button
              aria-label={screen === "settings" ? "Return to note" : "Open settings"}
              className={`header-icon${screen === "settings" ? " active" : ""}`}
              onClick={() => {
                if (screen === "settings") {
                  if (!goBack()) {
                    navigateTo("daily", {
                      dailyDateKey: todayDateKey,
                      focusEditor: true,
                      pushHistory: false,
                      resetHistory: true,
                    });
                  }
                  return;
                }

                navigateTo("settings");
              }}
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
                <p>Choose any empty or existing directory.</p>
              </article>
              <article className="onboarding-card">
                <span className="onboarding-step">2</span>
                <h3>Daily notes</h3>
                <p>One file per day, auto-created with the calendar arrows.</p>
              </article>
              <article className="onboarding-card">
                <span className="onboarding-step">3</span>
                <h3>Notes library</h3>
                <p>Create folders inside <code>notes/</code> and mdbar browses them.</p>
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
            onClose={() => {
              if (!goBack()) {
                navigateTo("daily", {
                  dailyDateKey: todayDateKey,
                  focusEditor: true,
                  pushHistory: false,
                  resetHistory: true,
                });
              }
            }}
            settings={settings}
            shortcutStatus={shortcutStatus}
          />
        ) : screen === "library" ? (
          <LibraryView
            libraryFolders={libraryFolders}
            libraryNotes={libraryNotes}
            onCreateFolder={() => openComposer("folder")}
            onCreateNote={() => openComposer("note")}
            onCreateNoteInFolder={(directory) => void handleCreateNoteInFolder(directory)}
            onDeleteFolder={requestDeleteFolder}
            onDeleteNote={requestDeleteNote}
            onSelectNote={handleLibrarySelectNote}
            selectedNoteId={selectedLibraryNoteId}
          />
        ) : (
          <section className="panel-body">
            {errorMessage ? <p className="inline-message error">{errorMessage}</p> : null}

            {currentNote ? (
              <InkMarkdownEditor
                documentKey={editorDocumentKey}
                focusToken={editorFocusToken}
                isLoading={isLoadingNote}
                onChange={setDraft}
                onError={setErrorMessage}
                noteFilePath={currentNote.filePath}
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
                : "Create a markdown file in notes/."}
            </h2>
            <label className="field-label" htmlFor="new-item-name">
              {composerKind === "folder" ? "Folder name" : "Title"}
            </label>
            <input
              autoFocus
              id="new-item-name"
              onChange={(event) => setNewItemName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleComposerSubmit();
              }}
              placeholder={composerKind === "folder" ? "projects/client" : "Project brief"}
              type="text"
              value={newItemName}
            />
            <p className="field-hint">
              {composerKind === "folder"
                ? "Use a path like projects/client to nest folders."
                : "The note will be created as a .md file."}
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
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteNote ? (
        <div
          className="sheet-backdrop"
          onClick={() => {
            if (!isDeleting) {
              setPendingDeleteNote(null);
            }
          }}
          role="presentation"
        >
          <div className="composer-modal composer-modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="delete-modal-heading">
              <span className="delete-modal-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M8.2 8.8v8.3M12 8.8v8.3M15.8 8.8v8.3M5.5 6.6h13M9.2 4.8h5.6M7.2 6.6l.5 11a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4l.5-11"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.35"
                  />
                </svg>
              </span>
              <div>
                <p className="empty-kicker">Delete note</p>
                <h2>Delete &quot;{pendingDeleteNote.title}&quot;?</h2>
              </div>
            </div>
            <p className="delete-target-path">{pendingDeleteNote.relativePath}</p>
            <p className="composer-helper">
              This removes the markdown file and any pasted images stored next to it. You can&apos;t undo this.
            </p>
            <div className="composer-actions">
              <button
                className="secondary-button"
                disabled={isDeleting}
                onClick={() => setPendingDeleteNote(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                disabled={isDeleting}
                onClick={() => void confirmDeletePendingNote()}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteFolder ? (
        <div
          className="sheet-backdrop"
          onClick={() => {
            if (!isDeleting) {
              setPendingDeleteFolder(null);
            }
          }}
          role="presentation"
        >
          <div className="composer-modal composer-modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="delete-modal-heading">
              <span className="delete-modal-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M3.8 8.25c0-1.02.83-1.85 1.85-1.85h4.16l1.52 1.78h6.99c1.02 0 1.85.83 1.85 1.85v1.03"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.35"
                    opacity="0.68"
                  />
                  <path
                    d="M6.65 11.38c.23-.52.75-.86 1.33-.86h11.05c.98 0 1.69.94 1.4 1.86l-1.49 4.72a1.45 1.45 0 0 1-1.38 1.01H5.36c-1.01 0-1.72-1.03-1.33-1.96l2.62-4.77Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.35"
                  />
                </svg>
              </span>
              <div>
                <p className="empty-kicker">Delete folder</p>
                <h2>Delete &quot;{pendingDeleteFolder.name}&quot;?</h2>
              </div>
            </div>
            <p className="delete-target-path">{pendingDeleteFolder.relativePath}</p>
            {pendingDeleteFolderContents ? (
              <p className="delete-footprint">Contains {pendingDeleteFolderContents}.</p>
            ) : (
              <p className="delete-footprint">This folder is empty.</p>
            )}
            <p className="composer-helper">
              This removes the folder and everything nested inside it, including notes, subfolders, and pasted images.
            </p>
            <div className="composer-actions">
              <button
                className="secondary-button"
                disabled={isDeleting}
                onClick={() => setPendingDeleteFolder(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                disabled={isDeleting}
                onClick={() => void confirmDeletePendingFolder()}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete folder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
