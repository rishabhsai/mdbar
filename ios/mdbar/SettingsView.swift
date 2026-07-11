import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Sync") {
                    Label("iCloud Drive", systemImage: "icloud")
                    Text("Your Markdown notebook syncs through iCloud. Widgets keep a lightweight App Group snapshot for fast updates.")
                        .font(.footnote)
                        .foregroundStyle(MDTheme.secondary)
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
