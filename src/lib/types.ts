export type ThemePreference = "system" | "light" | "dark";
export type NoteKind = "daily" | "library";

export type NoteSummary = {
  id: string;
  title: string;
  filePath: string;
  relativePath: string;
  directory: string;
  updatedAtMs: number;
};

export type NoteDocument = NoteSummary & {
  kind: NoteKind;
  content: string;
};

export type FolderSummary = {
  id: string;
  name: string;
  relativePath: string;
  directory: string;
  updatedAtMs: number;
};

export type SaveNoteResult = {
  persisted: boolean;
  updatedAtMs: number;
};

export type SavedImageAsset = {
  filePath: string;
  markdownPath: string;
};

export type AppSettings = {
  notebookPath: string | null;
  theme: ThemePreference;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  shortcut: string;
  lastLibraryNoteId: string | null;
};

export const defaultSettings: AppSettings = {
  notebookPath: null,
  theme: "system",
  fontFamily: "Iowan Old Style",
  fontSize: 17,
  lineHeight: 1.6,
  shortcut: "CmdOrControl+Shift+M",
  lastLibraryNoteId: null,
};
