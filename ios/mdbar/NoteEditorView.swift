import SwiftUI

struct NoteEditorView: View {
    @EnvironmentObject private var store: NotebookStore
    @Environment(\.dismiss) private var dismiss
    @State private var note: NoteRecord
    @State private var saveTask: Task<Void, Never>?

    init(note: NoteRecord) {
        _note = State(initialValue: note)
    }

    var body: some View {
        ScrollView {
            MarkdownEditor(
                text: Binding(
                    get: { note.content },
                    set: { value in
                        note.content = value
                        note.modifiedAt = .now
                        scheduleSave()
                    }
                ),
                placeholder: "Write in Markdown",
                minHeight: 620
            )
            .padding(.horizontal, 20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(MDTheme.canvas)
        .navigationTitle(note.title)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Copy Markdown", systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = note.content
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) {
                        store.delete(note)
                        dismiss()
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 44, height: 44)
                }
            }
        }
        .onDisappear {
            saveTask?.cancel()
            store.save(note)
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await MainActor.run { store.save(note) }
        }
    }
}
