import { invoke } from "@tauri-apps/api/core";

import type {
  FolderSummary,
  NoteDocument,
  NoteSummary,
  SavedImageAsset,
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

export function createLibraryNote(
  folderPath: string,
  title: string,
  directory?: string,
) {
  return invoke<NoteDocument>("create_library_note", {
    directory,
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

export function renameLibraryNote(
  folderPath: string,
  noteId: string,
  title: string,
) {
  return invoke<NoteDocument>("rename_library_note", {
    folderPath,
    noteId,
    title,
  });
}

export function deleteLibraryFolder(folderPath: string, directory: string) {
  return invoke("delete_library_folder", {
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

export function savePastedImage(
  noteFilePath: string,
  bytes: number[],
  mimeType?: string,
) {
  return invoke<SavedImageAsset>("save_pasted_image", {
    noteFilePath,
    bytes,
    mimeType,
  });
}

export function deleteNote(filePath: string) {
  return invoke("delete_note", {
    filePath,
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
