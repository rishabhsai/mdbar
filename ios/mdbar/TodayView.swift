import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: NotebookStore
    @State private var prose = ""
    @State private var newTask = ""
    @FocusState private var addingTask: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .foregroundStyle(MDTheme.ink)
                    .padding(.top, 20)

                Text(greeting)
                    .font(.subheadline)
                    .foregroundStyle(MDTheme.secondary)
                    .padding(.top, 6)
                    .padding(.bottom, 28)

                HStack {
                    Text("Tasks")
                        .font(.headline)
                    Spacer()
                    let completed = store.todayTasks.filter(\.isCompleted).count
                    Text("\(completed) of \(store.todayTasks.count)")
                        .font(.caption)
                        .foregroundStyle(MDTheme.secondary)
                }
                .padding(.bottom, 6)

                if store.todayTasks.isEmpty {
                    Text("Add a checkbox task here or type one in Markdown.")
                        .font(.subheadline)
                        .foregroundStyle(MDTheme.secondary)
                        .padding(.vertical, 14)
                } else {
                    ForEach(store.todayTasks) { task in
                        TaskRow(task: task) { store.toggle(task) }
                        Divider().overlay(MDTheme.divider)
                    }
                }

                HStack(spacing: 10) {
                    Image(systemName: "plus")
                        .foregroundStyle(MDTheme.secondary)
                    TextField("Add task", text: $newTask)
                        .focused($addingTask)
                        .submitLabel(.done)
                        .onSubmit(addTask)
                }
                .frame(minHeight: 48)
                .padding(.bottom, 22)

                HStack {
                    Text("Daily note")
                        .font(.headline)
                    Spacer()
                    Text("\(prose.split(whereSeparator: { $0.isWhitespace }).count) words")
                        .font(.caption)
                        .foregroundStyle(MDTheme.secondary)
                }
                .padding(.bottom, 4)

                MarkdownEditor(
                    text: Binding(
                        get: { prose },
                        set: { value in
                            prose = value
                            saveProse(value)
                        }
                    ),
                    placeholder: "Write today's note",
                    minHeight: 360
                )
            }
            .padding(.horizontal, 20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(MDTheme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Reusable task", systemImage: "arrow.trianglehead.2.clockwise.rotate.90") {
                        newTask = " #reuse"
                        addingTask = true
                    }
                    Button("Carry unfinished", systemImage: "arrow.forward") {
                        newTask = " #carry"
                        addingTask = true
                    }
                    Button("Reminder", systemImage: "bell") {
                        newTask = " @remind(09:00)"
                        addingTask = true
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Task options")
            }
        }
        .onChange(of: store.today?.id) { _, _ in loadProse() }
        .onAppear(perform: loadProse)
        .overlay {
            if store.isLoading {
                ProgressView().tint(MDTheme.accent)
            }
        }
    }

    private var greeting: String {
        let hour = Calendar.autoupdatingCurrent.component(.hour, from: .now)
        if hour < 12 { return "Good morning." }
        if hour < 18 { return "Good afternoon." }
        return "Good evening."
    }

    private func loadProse() {
        guard let content = store.today?.content else { return }
        prose = content.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("- [") }
            .joined(separator: "\n")
            .trimmingCharacters(in: .newlines)
    }

    private func saveProse(_ value: String) {
        guard let current = store.today?.content else { return }
        let tasks = current.components(separatedBy: "\n")
            .filter { $0.trimmingCharacters(in: .whitespaces).hasPrefix("- [") }
        let taskBlock = tasks.joined(separator: "\n")
        let combined = [taskBlock, value]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n\n")
        store.saveToday(combined)
    }

    private func addTask() {
        let clean = newTask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        let line = "- [ ] \(clean)"
        let current = store.today?.content ?? ""
        store.saveToday(MarkdownTasks.appendingUnique([line], to: current))
        newTask = ""
    }
}
