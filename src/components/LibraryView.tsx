import { useMemo, useState, type CSSProperties } from "react";

import type { FolderSummary, NoteSummary } from "../lib/types";

type LibraryViewProps = {
  libraryFolders: FolderSummary[];
  libraryNotes: NoteSummary[];
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onSelectNote: (noteId: string) => void;
  selectedNoteId: string | null;
};

type FolderTree = {
  folders: Map<string, FolderTree>;
  notes: NoteSummary[];
};

function buildTree(
  notes: NoteSummary[],
  folders: FolderSummary[],
): FolderTree {
  const root: FolderTree = { folders: new Map(), notes: [] };

  for (const folder of folders) {
    const parts = folder.relativePath.split("/").filter(Boolean);
    let current = root;

    for (const part of parts) {
      if (!current.folders.has(part)) {
        current.folders.set(part, { folders: new Map(), notes: [] });
      }

      current = current.folders.get(part)!;
    }
  }

  for (const note of notes) {
    const parts = note.relativePath.split("/");
    let current = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const folderName = parts[index];

      if (!current.folders.has(folderName)) {
        current.folders.set(folderName, { folders: new Map(), notes: [] });
      }

      current = current.folders.get(folderName)!;
    }

    current.notes.push(note);
  }

  return root;
}

function formatTimestamp(ms: number) {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function FolderGlyph({ isOpen }: { isOpen: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {isOpen ? (
        <>
          <path
            d="M3.5 8.6c0-1.16.94-2.1 2.1-2.1h4.2l1.56 1.84h7.02c1.16 0 2.1.94 2.1 2.1v.57a2.1 2.1 0 0 0-.68-.11H8.4c-.85 0-1.61.5-1.95 1.28l-.33.77H5.6a2.1 2.1 0 0 1-2.1-2.1V8.6Z"
            fill="currentColor"
            opacity="0.42"
          />
          <path
            d="M7.18 12.3c.27-.63.89-1.05 1.58-1.05h11.01c1.13 0 1.94 1.09 1.6 2.17l-1.65 5.2a1.7 1.7 0 0 1-1.62 1.18H5.27c-1.18 0-2-1.21-1.54-2.3l3.45-5.2Z"
            fill="currentColor"
          />
        </>
      ) : (
        <>
          <path
            d="M3.5 8.5c0-1.1.9-2 2-2h4.22l1.5 1.72h7.28c1.1 0 2 .9 2 2v7.28c0 1.1-.9 2-2 2H5.5c-1.1 0-2-.9-2-2V8.5Z"
            fill="currentColor"
            opacity="0.82"
          />
          <path
            d="M3.5 9.05c0-.67.55-1.22 1.22-1.22h5.01l1.42 1.6h8.13c.67 0 1.22.55 1.22 1.22"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.2"
            opacity="0.38"
          />
        </>
      )}
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M6.2 4.8h7.76l4.04 4.04v9.16c0 1.1-.9 2-2 2H6.2c-1.1 0-2-.9-2-2V6.8c0-1.1.9-2 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M13.96 4.8v4.04H18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M7.7 12.1h6.6M7.7 15.1h5.05"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function FolderNode({
  depth,
  name,
  tree,
  onSelectNote,
  selectedNoteId,
}: {
  depth: number;
  name: string;
  tree: FolderTree;
  onSelectNote: (noteId: string) => void;
  selectedNoteId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const folderEntries = Array.from(tree.folders.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const sortedNotes = [...tree.notes].sort((left, right) =>
    left.title.localeCompare(right.title),
  );

  return (
    <div className="lib-folder" style={{ "--depth": depth } as CSSProperties}>
      <button
        className={`lib-folder-toggle ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="lib-folder-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="m9 6 6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        </span>
        <span className="lib-folder-icon" aria-hidden="true">
          <FolderGlyph isOpen={isOpen} />
        </span>
        <span className="lib-folder-name">{name}</span>
        <span className="lib-folder-count">
          {folderEntries.length + sortedNotes.length}
        </span>
      </button>

      {isOpen ? (
        <div className="lib-folder-children">
          {folderEntries.map(([childName, childTree]) => (
            <FolderNode
              depth={depth + 1}
              key={childName}
              name={childName}
              onSelectNote={onSelectNote}
              selectedNoteId={selectedNoteId}
              tree={childTree}
            />
          ))}

          {sortedNotes.map((note) => (
            <button
              className={`lib-note-item${selectedNoteId === note.id ? " is-active" : ""}`}
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              style={{ "--depth": depth + 1 } as CSSProperties}
              type="button"
            >
              <span className="lib-note-icon" aria-hidden="true">
                <NoteGlyph />
              </span>
              <span className="lib-note-info">
                <span className="lib-note-title">{note.title}</span>
                <span className="lib-note-meta">{formatTimestamp(note.updatedAtMs)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LibraryView({
  libraryFolders,
  libraryNotes,
  onCreateFolder,
  onCreateNote,
  onSelectNote,
  selectedNoteId,
}: LibraryViewProps) {
  const tree = useMemo(
    () => buildTree(libraryNotes, libraryFolders),
    [libraryNotes, libraryFolders],
  );

  const folderEntries = Array.from(tree.folders.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const rootNotes = [...tree.notes].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
  const isEmpty = libraryNotes.length === 0 && libraryFolders.length === 0;

  return (
    <section className="library-view">
      <div className="lib-header">
        <div className="lib-header-row">
          <span className="lib-header-label">Notes</span>
          <span className="lib-header-count">
            {libraryNotes.length} files
            {libraryFolders.length > 0 ? ` • ${libraryFolders.length} folders` : ""}
          </span>
        </div>
        <div className="lib-header-actions">
          <button className="lib-action-button" onClick={onCreateNote} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
            Note
          </button>
          <button className="lib-action-button" onClick={onCreateFolder} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
            Folder
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="lib-empty">
          <p className="lib-empty-title">No notes yet</p>
          <p className="lib-empty-copy">Create a note or folder to get started.</p>
        </div>
      ) : (
        <div className="lib-tree">
          {folderEntries.map(([name, folderTree]) => (
            <FolderNode
              depth={0}
              key={name}
              name={name}
              onSelectNote={onSelectNote}
              selectedNoteId={selectedNoteId}
              tree={folderTree}
            />
          ))}

          {rootNotes.map((note) => (
            <button
              className={`lib-note-item${selectedNoteId === note.id ? " is-active" : ""}`}
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              style={{ "--depth": 0 } as CSSProperties}
              type="button"
            >
              <span className="lib-note-icon" aria-hidden="true">
                <NoteGlyph />
              </span>
              <span className="lib-note-info">
                <span className="lib-note-title">{note.title}</span>
                <span className="lib-note-meta">{formatTimestamp(note.updatedAtMs)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
