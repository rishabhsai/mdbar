import Foundation
import SwiftUI
import WidgetKit

@MainActor
final class NotebookStore: ObservableObject {
    @Published var today: NoteRecord?
    @Published var notes: [NoteRecord] = []
    @Published var isLoading = true
    @Published var errorMessage: String?

    let root: URL
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        root = NotebookPaths.root(fileManager: fileManager)
    }

    var todayTasks: [MarkdownTask] {
        guard let today else { return [] }
        return MarkdownTasks.parse(today.content, notePath: today.relativePath)
    }

    func start() async {
        do {
            try prepareFolders()
            try rolloverIntoToday()
            today = try readNote(at: NotebookPaths.dailyURL(date: .now, root: root), isDaily: true)
            notes = try loadLibraryNotes()
            refreshSnapshot()
            await ReminderScheduler.sync(tasks: todayTasks)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func saveToday(_ content: String) {
        guard var note = today else { return }
        note.content = content
        note.modifiedAt = .now
        today = note
        save(note)
        refreshSnapshot()
        Task { await ReminderScheduler.sync(tasks: todayTasks) }
    }

    func save(_ note: NoteRecord) {
        do {
            let url = root.appendingPathComponent(note.relativePath)
            try note.content.write(to: url, atomically: true, encoding: .utf8)
            if note.isDaily {
                today = note
            } else if let index = notes.firstIndex(where: { $0.id == note.id }) {
                notes[index] = note
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggle(_ task: MarkdownTask) {
        guard let note = today else { return }
        saveToday(MarkdownTasks.toggle(task: task, in: note.content))
    }

    func createNote(title: String) -> NoteRecord? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        let base = clean.lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let slug = base.isEmpty ? "untitled" : base
        var url = root.appendingPathComponent("notes/\(slug).md")
        var suffix = 2
        while fileManager.fileExists(atPath: url.path) {
            url = root.appendingPathComponent("notes/\(slug)-\(suffix).md")
            suffix += 1
        }
        do {
            try "".write(to: url, atomically: true, encoding: .utf8)
            let note = try readNote(at: url, isDaily: false)
            notes.insert(note, at: 0)
            return note
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func delete(_ note: NoteRecord) {
        do {
            try fileManager.removeItem(at: root.appendingPathComponent(note.relativePath))
            withAnimation(.easeOut(duration: 0.18)) {
                notes.removeAll { $0.id == note.id }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func prepareFolders() throws {
        try fileManager.createDirectory(
            at: root.appendingPathComponent("daily"),
            withIntermediateDirectories: true
        )
        try fileManager.createDirectory(
            at: root.appendingPathComponent("notes"),
            withIntermediateDirectories: true
        )
    }

    private func rolloverIntoToday() throws {
        let calendar = Calendar.autoupdatingCurrent
        guard let yesterday = calendar.date(byAdding: .day, value: -1, to: .now) else { return }
        let sourceURL = NotebookPaths.dailyURL(date: yesterday, root: root)
        let destinationURL = NotebookPaths.dailyURL(date: .now, root: root)
        let source = (try? String(contentsOf: sourceURL, encoding: .utf8)) ?? ""
        let destination = (try? String(contentsOf: destinationURL, encoding: .utf8)) ?? ""
        let additions = MarkdownTasks.rolloverLines(from: source, sourcePath: relativePath(for: sourceURL))
        let updated = MarkdownTasks.appendingUnique(additions, to: destination)
        if updated != destination || !fileManager.fileExists(atPath: destinationURL.path) {
            try updated.write(to: destinationURL, atomically: true, encoding: .utf8)
        }
    }

    private func readNote(at url: URL, isDaily: Bool) throws -> NoteRecord {
        let content = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        let values = try? url.resourceValues(forKeys: [.contentModificationDateKey])
        return NoteRecord(
            id: relativePath(for: url),
            title: isDaily ? "Today" : title(from: url),
            relativePath: relativePath(for: url),
            content: content,
            modifiedAt: values?.contentModificationDate ?? .now,
            isDaily: isDaily
        )
    }

    private func loadLibraryNotes() throws -> [NoteRecord] {
        let notesRoot = root.appendingPathComponent("notes")
        guard let enumerator = fileManager.enumerator(
            at: notesRoot,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        return try enumerator.compactMap { item in
            guard let url = item as? URL, url.pathExtension.lowercased() == "md" else { return nil }
            return try readNote(at: url, isDaily: false)
        }.sorted { $0.modifiedAt > $1.modifiedAt }
    }

    private func refreshSnapshot() {
        guard let today else { return }
        SnapshotStore.save(
            WidgetSnapshot(
                generatedAt: .now,
                dateLabel: Date.now.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()),
                noteExcerpt: today.excerpt.isEmpty ? "A quiet place for today's thoughts." : today.excerpt,
                wordCount: today.content.split(whereSeparator: { $0.isWhitespace }).count,
                tasks: todayTasks
            )
        )
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func relativePath(for url: URL) -> String {
        url.path.replacingOccurrences(of: root.path + "/", with: "")
    }

    private func title(from url: URL) -> String {
        url.deletingPathExtension().lastPathComponent
            .replacingOccurrences(of: "-", with: " ")
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}
