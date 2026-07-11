import AppIntents
import Foundation
import WidgetKit

struct ToggleTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Toggle task"
    static let description = IntentDescription("Marks an mdbar task complete or incomplete.")
    static let openAppWhenRun = false

    @Parameter(title: "Note path") var notePath: String
    @Parameter(title: "Line") var lineIndex: Int

    init() {}

    init(notePath: String, lineIndex: Int) {
        self.notePath = notePath
        self.lineIndex = lineIndex
    }

    func perform() async throws -> some IntentResult {
        let root = NotebookPaths.root()
        let url = root.appendingPathComponent(notePath)
        let content = try String(contentsOf: url, encoding: .utf8)
        guard let task = MarkdownTasks.parse(content, notePath: notePath)
            .first(where: { $0.lineIndex == lineIndex }) else {
            return .result()
        }
        let updated = MarkdownTasks.toggle(task: task, in: content)
        try updated.write(to: url, atomically: true, encoding: .utf8)
        if notePath == relativeTodayPath() {
            SnapshotStore.save(makeSnapshot(content: updated, path: notePath))
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }

    private func relativeTodayPath() -> String {
        "daily/" + NotebookPaths.dailyURL(date: .now).lastPathComponent
    }

    private func makeSnapshot(content: String, path: String) -> WidgetSnapshot {
        let prose = content.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("- [") }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return WidgetSnapshot(
            generatedAt: .now,
            dateLabel: Date.now.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()),
            noteExcerpt: prose.isEmpty ? "A quiet place for today's thoughts." : prose,
            wordCount: content.split(whereSeparator: { $0.isWhitespace }).count,
            tasks: MarkdownTasks.parse(content, notePath: path)
        )
    }
}
