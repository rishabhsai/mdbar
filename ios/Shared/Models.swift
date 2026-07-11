import Foundation

struct NoteRecord: Identifiable, Hashable, Codable, Sendable {
    let id: String
    var title: String
    var relativePath: String
    var content: String
    var modifiedAt: Date
    var isDaily: Bool

    var excerpt: String {
        content
            .split(separator: "\n")
            .map(String.init)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("- [") }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct MarkdownTask: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let notePath: String
    let lineIndex: Int
    var text: String
    var isCompleted: Bool
    var repeats: Bool
    var carries: Bool
    var reminderTime: String?
}

struct WidgetSnapshot: Codable, Sendable {
    var generatedAt: Date
    var dateLabel: String
    var noteExcerpt: String
    var wordCount: Int
    var tasks: [MarkdownTask]

    static let empty = WidgetSnapshot(
        generatedAt: .now,
        dateLabel: "Today",
        noteExcerpt: "Open mdbar to begin today's note.",
        wordCount: 0,
        tasks: []
    )
}
