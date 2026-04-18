export type ThemePreference = "system" | "light" | "dark";
export type EditorFont = "editorial" | "sans" | "mono";
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

export type SaveNoteResult = {
  persisted: boolean;
  updatedAtMs: number;
};

export type AppSettings = {
  notebookPath: string | null;
  theme: ThemePreference;
  fontFamily: EditorFont;
  fontSize: number;
  lineHeight: number;
  shortcut: string;
};

export const defaultSettings: AppSettings = {
  notebookPath: null,
  theme: "system",
  fontFamily: "editorial",
  fontSize: 17,
  lineHeight: 1.6,
  shortcut: "CommandOrControl+Shift+M",
};
