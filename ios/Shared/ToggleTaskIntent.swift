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
        if SyncConfiguration.current() != nil {
            if let snapshot = try await CloudWidgetSupport.toggle(notePath: notePath, lineIndex: lineIndex) {
                SnapshotStore.save(snapshot)
            }
            WidgetCenter.shared.reloadAllTimelines()
            return .result()
        }

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
            SnapshotStore.save(CloudWidgetSupport.snapshot(content: updated, path: notePath))
        }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }

    private func relativeTodayPath() -> String {
        "daily/" + NotebookPaths.dailyURL(date: .now).lastPathComponent
    }

}
