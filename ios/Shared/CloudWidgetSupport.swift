import Foundation

enum CloudWidgetSupport {
    static func todaySnapshot() async -> WidgetSnapshot? {
        guard let configuration = SyncConfiguration.current() else { return nil }
        let client = CloudSyncClient(configuration: configuration)
        guard let remote = try? await client.today(date: todayFileDate()), let content = remote.content else {
            return nil
        }
        return snapshot(content: content, path: remote.path)
    }

    static func toggle(notePath: String, lineIndex: Int) async throws -> WidgetSnapshot? {
        guard let configuration = SyncConfiguration.current() else { return nil }
        let client = CloudSyncClient(configuration: configuration)
        var remote = try await client.note(path: notePath)
        for _ in 0..<2 {
            let content = remote.content ?? ""
            guard let task = MarkdownTasks.parse(content, notePath: notePath)
                .first(where: { $0.lineIndex == lineIndex }) else { return nil }
            let updated = MarkdownTasks.toggle(task: task, in: content)
            do {
                let saved = try await client.put(path: notePath, content: updated, baseRevision: remote.revision)
                return snapshot(content: saved.content ?? updated, path: notePath)
            } catch let CloudSyncError.conflict(current) {
                guard let current else { throw CloudSyncError.conflict(nil) }
                remote = current
            }
        }
        throw CloudSyncError.conflict(remote)
    }

    static func snapshot(content: String, path: String) -> WidgetSnapshot {
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

    private static func todayFileDate() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: .now)
    }
}
