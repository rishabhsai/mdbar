import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: NotebookStore

    var body: some View {
        NavigationStack {
            List {
                Section("Sync") {
                    HStack {
                        Label(SyncConfiguration.current() == nil ? "Local Markdown" : "mdbar Cloud", systemImage: SyncConfiguration.current() == nil ? "iphone" : "cloud")
                        Spacer()
                        if store.isSyncing {
                            ProgressView().controlSize(.small)
                        }
                    }
                    Text(store.syncStatus)
                        .font(.footnote)
                        .foregroundStyle(MDTheme.secondary)
                    if SyncConfiguration.current() != nil {
                        Button("Sync now") {
                            Task { await store.syncNow() }
                        }
                        .disabled(store.isSyncing)
                    } else {
                        Text("Cloud sync is optional. Your notes continue working offline as normal Markdown files.")
                            .font(.footnote)
                            .foregroundStyle(MDTheme.secondary)
                    }
                }
                Section("Task syntax") {
                    syntax("#reuse", "Repeat every day")
                    syntax("#carry", "Move forward when unfinished")
                    syntax("@remind(09:00)", "Notify at a time")
                }
                Section("Files") {
                    Text("daily/YYYY-MM-DD.md")
                    Text("notes/your-note.md")
                }
            }
            .scrollContentBackground(.hidden)
            .background(MDTheme.canvas)
            .navigationTitle("mdbar")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func syntax(_ token: String, _ description: String) -> some View {
        HStack {
            Text(token).font(.system(.body, design: .monospaced))
            Spacer()
            Text(description)
                .font(.caption)
                .foregroundStyle(MDTheme.secondary)
        }
    }
}
