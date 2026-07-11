import CryptoKit
import Foundation

enum MarkdownTasks {
    private static let taskPattern = try! NSRegularExpression(
        pattern: #"^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$"#
    )
    private static let reminderPattern = try! NSRegularExpression(
        pattern: #"@remind\(([0-2]?\d:[0-5]\d)\)"#,
        options: [.caseInsensitive]
    )

    static func parse(_ content: String, notePath: String) -> [MarkdownTask] {
        content.components(separatedBy: "\n").enumerated().compactMap { index, line in
            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            guard let match = taskPattern.firstMatch(in: line, range: range),
                  let checkRange = Range(match.range(at: 1), in: line),
                  let bodyRange = Range(match.range(at: 2), in: line) else { return nil }

            let body = String(line[bodyRange])
            let normalized = body.lowercased()
            let bodyNSRange = NSRange(body.startIndex..<body.endIndex, in: body)
            let reminder = reminderPattern.firstMatch(in: body, range: bodyNSRange)
                .flatMap { Range($0.range(at: 1), in: body) }
                .map { String(body[$0]) }
            return MarkdownTask(
                id: stableID(path: notePath, line: index, body: body),
                notePath: notePath,
                lineIndex: index,
                text: visibleText(body),
                isCompleted: line[checkRange].lowercased() == "x",
                repeats: normalized.contains("#reuse") || normalized.contains("[reuse]"),
                carries: normalized.contains("#carry") || normalized.contains("[carry]"),
                reminderTime: reminder
            )
        }
    }

    static func toggle(task: MarkdownTask, in content: String) -> String {
        var lines = content.components(separatedBy: "\n")
        guard lines.indices.contains(task.lineIndex) else { return content }
        let line = lines[task.lineIndex]
        let range = NSRange(line.startIndex..<line.endIndex, in: line)
        guard taskPattern.firstMatch(in: line, range: range) != nil else { return content }
        if let token = line.range(of: task.isCompleted ? "[x]" : "[ ]", options: [.caseInsensitive]) {
            lines[task.lineIndex].replaceSubrange(token, with: task.isCompleted ? "[ ]" : "[x]")
        }
        return lines.joined(separator: "\n")
    }

    static func rolloverLines(from content: String, sourcePath: String) -> [String] {
        let lines = content.components(separatedBy: "\n")
        return parse(content, notePath: sourcePath).compactMap { task in
            guard task.repeats || (task.carries && !task.isCompleted),
                  lines.indices.contains(task.lineIndex) else { return nil }
            return lines[task.lineIndex]
                .replacingOccurrences(of: #"\[[xX]\]"#, with: "[ ]", options: .regularExpression)
        }
    }

    static func appendingUnique(_ lines: [String], to content: String) -> String {
        guard !lines.isEmpty else { return content }
        let existing = Set(content.components(separatedBy: "\n").map(normalizedTaskLine))
        let additions = lines.filter { !existing.contains(normalizedTaskLine($0)) }
        guard !additions.isEmpty else { return content }
        let trimmed = content.trimmingCharacters(in: .newlines)
        let separator = trimmed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "\n"
        return trimmed + separator + additions.joined(separator: "\n") + "\n"
    }

    private static func visibleText(_ body: String) -> String {
        body
            .replacingOccurrences(
                of: #"\s*(#reuse|#carry|\[reuse\]|\[carry\]|@remind\([^)]+\))"#,
                with: "",
                options: [.regularExpression, .caseInsensitive]
            )
            .trimmingCharacters(in: .whitespaces)
    }

    private static func normalizedTaskLine(_ line: String) -> String {
        line.lowercased()
            .replacingOccurrences(of: #"\[[ x]\]"#, with: "[]", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func stableID(path: String, line: Int, body: String) -> String {
        let digest = SHA256.hash(data: Data("\(path)|\(line)|\(body)".utf8))
        return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
    }
}
