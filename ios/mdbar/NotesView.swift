import SwiftUI

struct NotesView: View {
    @EnvironmentObject private var store: NotebookStore
    @State private var query = ""
    @State private var newTitle = ""
    @State private var showingNewNote = false
    @State private var showingSettings = false
    @State private var createdNote: NoteRecord?

    private var filtered: [NoteRecord] {
        guard !query.isEmpty else { return store.notes }
        return store.notes.filter {
            $0.title.localizedCaseInsensitiveContains(query)
                || $0.content.localizedCaseInsensitiveContains(query)
                || $0.relativePath.localizedCaseInsensitiveContains(query)
        }
    }

    private var folders: [(String, Int)] {
        let values = Dictionary(grouping: store.notes) { note in
            let components = note.relativePath.split(separator: "/")
            return components.count > 2 ? String(components[1]) : "Notes"
        }
        return values.map { ($0.key, $0.value.count) }.sorted { $0.0 < $1.0 }
    }

    var body: some View {
        List {
            if query.isEmpty, !folders.isEmpty {
                Section("Folders") {
                    ForEach(folders, id: \.0) { folder, count in
                        HStack(spacing: 14) {
                            Image(systemName: "folder")
                                .foregroundStyle(MDTheme.ink)
                            Text(folder)
                            Spacer()
                            Text("\(count)")
                                .font(.caption)
                                .foregroundStyle(MDTheme.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundStyle(MDTheme.faint)
                        }
                        .frame(minHeight: 44)
                    }
                }
            }

            Section(query.isEmpty ? "Recent notes" : "\(filtered.count) results") {
                if filtered.isEmpty {
                    ContentUnavailableView(
                        query.isEmpty ? "No notes yet" : "No matches",
                        systemImage: query.isEmpty ? "note.text" : "magnifyingglass",
                        description: Text(query.isEmpty ? "Create a note when an idea arrives." : "Try another title or phrase.")
                    )
                    .listRowBackground(Color.clear)
                }
                ForEach(filtered) { note in
                    NavigationLink(value: note) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(note.title)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(MDTheme.ink)
                                Spacer()
                                Text(note.modifiedAt, style: .relative)
                                    .font(.caption2)
                                    .foregroundStyle(MDTheme.secondary)
                            }
                            if !note.excerpt.isEmpty {
                                Text(note.excerpt)
                                    .font(.caption)
                                    .foregroundStyle(MDTheme.secondary)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.vertical, 5)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { store.delete(note) } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(MDTheme.canvas)
        .navigationTitle("Notes")
        .searchable(text: $query, prompt: "Search notes")
        .navigationDestination(for: NoteRecord.self) { note in
            NoteEditorView(note: note)
        }
        .navigationDestination(item: $createdNote) { note in
            NoteEditorView(note: note)
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    showingNewNote = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("New note")
                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Settings")
            }
        }
        .alert("New note", isPresented: $showingNewNote) {
            TextField("Title", text: $newTitle)
            Button("Cancel", role: .cancel) { newTitle = "" }
            Button("Create") {
                createdNote = store.createNote(title: newTitle)
                newTitle = ""
            }
        } message: {
            Text("A Markdown file will be created in notes/.")
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
    }
}
