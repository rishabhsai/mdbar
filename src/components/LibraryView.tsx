import { useMemo, useState } from "react";
import type { NoteSummary } from "../lib/types";

type LibraryViewProps = {
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

function buildTree(notes: NoteSummary[]): FolderTree {
  const root: FolderTree = { folders: new Map(), notes: [] };

  for (const note of notes) {
    const parts = note.relativePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];

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
  const folderEntries = Array.from(tree.folders.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const sortedNotes = [...tree.notes].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return (
    <div className="lib-folder" style={{ "--depth": depth } as React.CSSProperties}>
      <button
        className={`lib-folder-toggle ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((v) => !v)}
        type="button"
      >
        <span className="lib-folder-chevron" aria-hidden="true">
          ›
        </span>
        <span className="lib-folder-icon" aria-hidden="true">
          {isOpen ? "📂" : "📁"}
        </span>
        <span className="lib-folder-name">{name}</span>
        <span className="lib-folder-count">
          {tree.notes.length + tree.folders.size}
        </span>
      </button>

      {isOpen ? (
        <div className="lib-folder-children">
          {folderEntries.map(([childName, childTree]) => (
            <FolderNode
              depth={depth + 1}
              key={childName}
              name={childName}
              tree={childTree}
              onSelectNote={onSelectNote}
              selectedNoteId={selectedNoteId}
            />
          ))}

          {sortedNotes.map((note) => (
            <button
              className={`lib-note-item${selectedNoteId === note.id ? " is-active" : ""}`}
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              style={{ "--depth": depth + 1 } as React.CSSProperties}
              type="button"
            >
              <span className="lib-note-icon" aria-hidden="true">
                📝
              </span>
              <span className="lib-note-info">
                <span className="lib-note-title">{note.title}</span>
                <span className="lib-note-meta">
                  {formatTimestamp(note.updatedAtMs)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LibraryView({
  libraryNotes,
  onCreateFolder,
  onCreateNote,
  onSelectNote,
  selectedNoteId,
}: LibraryViewProps) {
  const tree = useMemo(() => buildTree(libraryNotes), [libraryNotes]);

  const folderEntries = Array.from(tree.folders.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const rootNotes = [...tree.notes].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  const isEmpty = libraryNotes.length === 0;

  return (
    <section className="library-view">
      <div className="lib-header">
        <div className="lib-header-row">
          <span className="lib-header-label">Notes</span>
          <span className="lib-header-count">{libraryNotes.length} files</span>
        </div>
        <div className="lib-header-actions">
          <button
            className="lib-action-button"
            onClick={onCreateNote}
            type="button"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="13"
              height="13"
            >
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
          <button
            className="lib-action-button"
            onClick={onCreateFolder}
            type="button"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="13"
              height="13"
            >
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
          <p className="lib-empty-copy">
            Create a note or folder to get started.
          </p>
        </div>
      ) : (
        <div className="lib-tree">
          {folderEntries.map(([name, folderTree]) => (
            <FolderNode
              depth={0}
              key={name}
              name={name}
              tree={folderTree}
              onSelectNote={onSelectNote}
              selectedNoteId={selectedNoteId}
            />
          ))}

          {rootNotes.map((note) => (
            <button
              className={`lib-note-item${selectedNoteId === note.id ? " is-active" : ""}`}
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              style={{ "--depth": 0 } as React.CSSProperties}
              type="button"
            >
              <span className="lib-note-icon" aria-hidden="true">
                📝
              </span>
              <span className="lib-note-info">
                <span className="lib-note-title">{note.title}</span>
                <span className="lib-note-meta">
                  {formatTimestamp(note.updatedAtMs)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
