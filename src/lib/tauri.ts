import { invoke } from "@tauri-apps/api/core";

import type {
  FolderSummary,
  NoteDocument,
  NoteSummary,
  SaveNoteResult,
} from "./types";

export function openDailyNote(folderPath: string, dateKey: string) {
  return invoke<NoteDocument>("open_daily_note", {
    folderPath,
    dateKey,
  });
}

export function listLibraryNotes(folderPath: string) {
  return invoke<NoteSummary[]>("list_library_notes", {
    folderPath,
  });
}

export function listLibraryFolders(folderPath: string) {
  return invoke<FolderSummary[]>("list_library_folders", {
    folderPath,
  });
}

export function openLibraryNote(folderPath: string, noteId: string) {
  return invoke<NoteDocument>("open_library_note", {
    folderPath,
    noteId,
  });
}

export function createLibraryNote(folderPath: string, title: string) {
  return invoke<NoteDocument>("create_library_note", {
    folderPath,
    title,
  });
}

export function createLibraryFolder(folderPath: string, directory: string) {
  return invoke<string>("create_library_folder", {
    directory,
    folderPath,
  });
}

export function saveNote(filePath: string, content: string) {
  return invoke<SaveNoteResult>("save_note", {
    filePath,
    content,
  });
}

export function openNoteInDefaultApp(filePath: string) {
  return invoke("open_note_in_default_app", {
    filePath,
  });
}

export function revealNoteInFinder(filePath: string) {
  return invoke("reveal_note_in_finder", {
    filePath,
  });
}

export function toggleMainWindow() {
  return invoke("toggle_main_window");
}

export function setPanelAutoHide(enabled: boolean) {
  return invoke("set_panel_auto_hide", {
    enabled,
  });
}

export function listSystemFonts() {
  return invoke<string[]>("list_system_fonts");
}
