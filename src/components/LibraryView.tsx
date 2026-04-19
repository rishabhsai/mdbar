import { useMemo, useState, type CSSProperties } from "react";

import type { FolderSummary, NoteSummary } from "../lib/types";

type LibraryViewProps = {
  libraryFolders: FolderSummary[];
  libraryNotes: NoteSummary[];
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateNoteInFolder: (directory: string) => void;
  onDeleteFolder: (folder: FolderSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onSelectNote: (noteId: string) => void;
  selectedNoteId: string | null;
};

type FolderTree = {
  folder: FolderSummary | null;
  folders: Map<string, FolderTree>;
  notes: NoteSummary[];
};

function buildTree(
  notes: NoteSummary[],
  folders: FolderSummary[],
): FolderTree {
  const root: FolderTree = { folder: null, folders: new Map(), notes: [] };

  for (const folder of folders) {
    const parts = folder.relativePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (const part of parts) {
      if (!current.folders.has(part)) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        current.folders.set(part, {
          folder: {
            directory: currentPath.includes("/")
              ? currentPath.split("/").slice(0, -1).join("/")
              : "",
            id: currentPath,
            name: part,
            relativePath: currentPath,
            updatedAtMs: folder.updatedAtMs,
          },
          folders: new Map(),
          notes: [],
        });
      } else {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
      }

      current = current.folders.get(part)!;
    }

    current.folder = folder;
  }

  for (const note of notes) {
    const parts = note.relativePath.split("/");
    let current = root;
    let currentPath = "";

    for (let index = 0; index < parts.length - 1; index += 1) {
      const folderName = parts[index];

      if (!current.folders.has(folderName)) {
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        current.folders.set(folderName, {
          folder: {
            directory: currentPath.includes("/")
              ? currentPath.split("/").slice(0, -1).join("/")
              : "",
            id: currentPath,
            name: folderName,
            relativePath: currentPath,
            updatedAtMs: note.updatedAtMs,
          },
          folders: new Map(),
          notes: [],
        });
      } else {
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
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
      <path
        d="M3.8 8.25c0-1.02.83-1.85 1.85-1.85h4.16l1.52 1.78h6.99c1.02 0 1.85.83 1.85 1.85v1.03"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
        opacity={isOpen ? 0.74 : 0.92}
      />
      <path
        d="M6.65 11.38c.23-.52.75-.86 1.33-.86h11.05c.98 0 1.69.94 1.4 1.86l-1.49 4.72a1.45 1.45 0 0 1-1.38 1.01H5.36c-1.01 0-1.72-1.03-1.33-1.96l2.62-4.77Z"
        fill={isOpen ? "currentColor" : "none"}
        fillOpacity={isOpen ? 0.12 : 0}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M6.5 4.75h7.14l3.86 3.85v9.05A1.6 1.6 0 0 1 15.9 19.25H6.5a1.6 1.6 0 0 1-1.6-1.6v-11.3a1.6 1.6 0 0 1 1.6-1.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      />
      <path
        d="M13.64 4.75V8.6h3.86"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function NewNoteGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M7.15 4.85h7.02l3.68 3.7v8.97A1.48 1.48 0 0 1 16.37 19H7.15a1.48 1.48 0 0 1-1.47-1.48V6.33c0-.82.66-1.48 1.47-1.48Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      />
      <path
        d="M14.17 4.85v3.7h3.68M11.75 10.7v5.1M9.2 13.25h5.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function NewFolderGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M3.8 8.4c0-1.1.9-2 2-2h4.1l1.56 1.82h6.74c1.1 0 2 .9 2 2v.48"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
        opacity="0.7"
      />
      <path
        d="M7.02 11.4c.25-.56.8-.92 1.42-.92h10.22c1.02 0 1.75.98 1.45 1.94l-1.54 4.86a1.52 1.52 0 0 1-1.45 1.06H5.25c-1.06 0-1.8-1.08-1.39-2.06l3.16-4.88Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M15.5 11.9v4.2M13.4 14h4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function TrashGlyph() {
  return (
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
  );
}

function AddGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 5.5v13M5.5 12h13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function FolderNode({
  folder,
  depth,
  onCreateNoteInFolder,
  onDeleteFolder,
  onDeleteNote,
  tree,
  onSelectNote,
  selectedNoteId,
}: {
  folder: FolderSummary;
  depth: number;
  onCreateNoteInFolder: (directory: string) => void;
  onDeleteFolder: (folder: FolderSummary) => void;
  onDeleteNote: (note: NoteSummary) => void;
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
      <div className={`lib-folder-row ${isOpen ? "is-open" : ""}`}>
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
          <span className="lib-folder-name">{folder.name}</span>
          <span className="lib-folder-count">
            {folderEntries.length + sortedNotes.length}
          </span>
        </button>
        <div className="lib-folder-actions">
          <button
            aria-label={`Add note in ${folder.name}`}
            className="lib-folder-action"
            onClick={() => onCreateNoteInFolder(folder.relativePath)}
            type="button"
          >
            <AddGlyph />
          </button>
          <button
            aria-label={`Delete folder ${folder.name}`}
            className="lib-folder-action lib-folder-action-delete"
            onClick={() => onDeleteFolder(folder)}
            type="button"
          >
            <TrashGlyph />
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="lib-folder-children">
          {folderEntries.map(([childName, childTree]) => (
            <FolderNode
              depth={depth + 1}
              folder={
                childTree.folder ?? {
                  directory: folder.relativePath,
                  id: `${folder.relativePath}/${childName}`,
                  name: childName,
                  relativePath: `${folder.relativePath}/${childName}`,
                  updatedAtMs: 0,
                }
              }
              key={childTree.folder?.id ?? `${folder.relativePath}/${childName}`}
              onCreateNoteInFolder={onCreateNoteInFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteNote={onDeleteNote}
              onSelectNote={onSelectNote}
              selectedNoteId={selectedNoteId}
              tree={childTree}
            />
          ))}

          {sortedNotes.map((note) => (
            <div
              className={`lib-note-row${selectedNoteId === note.id ? " is-active" : ""}`}
              key={note.id}
              style={{ "--depth": depth + 1 } as CSSProperties}
            >
              <button
                className={`lib-note-item${selectedNoteId === note.id ? " is-active" : ""}`}
                onClick={() => onSelectNote(note.id)}
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
              <button
                aria-label={`Delete ${note.title}`}
                className="lib-note-delete"
                onClick={() => onDeleteNote(note)}
                type="button"
              >
                <TrashGlyph />
              </button>
            </div>
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
  onCreateNoteInFolder,
  onDeleteFolder,
  onDeleteNote,
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
            <NewNoteGlyph />
            Note
          </button>
          <button className="lib-action-button" onClick={onCreateFolder} type="button">
            <NewFolderGlyph />
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
              folder={
                folderTree.folder ?? {
                  directory: "",
                  id: name,
                  name,
                  relativePath: name,
                  updatedAtMs: 0,
                }
              }
              key={folderTree.folder?.id ?? name}
              onCreateNoteInFolder={onCreateNoteInFolder}
              onDeleteFolder={onDeleteFolder}
              onDeleteNote={onDeleteNote}
              onSelectNote={onSelectNote}
              selectedNoteId={selectedNoteId}
              tree={folderTree}
            />
          ))}

          {rootNotes.map((note) => (
            <div
              className={`lib-note-row${selectedNoteId === note.id ? " is-active" : ""}`}
              key={note.id}
              style={{ "--depth": 0 } as CSSProperties}
            >
              <button
                className={`lib-note-item${selectedNoteId === note.id ? " is-active" : ""}`}
                onClick={() => onSelectNote(note.id)}
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
              <button
                aria-label={`Delete ${note.title}`}
                className="lib-note-delete"
                onClick={() => onDeleteNote(note)}
                type="button"
              >
                <TrashGlyph />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
