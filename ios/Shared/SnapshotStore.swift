import Foundation

enum SnapshotStore {
    static func load() -> WidgetSnapshot {
        guard let url = NotebookPaths.snapshotURL(),
              let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else {
            return .empty
        }
        return value
    }

    static func save(_ snapshot: WidgetSnapshot) {
        guard let url = NotebookPaths.snapshotURL(),
              let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
