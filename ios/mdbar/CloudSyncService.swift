import Foundation

actor CloudSyncService {
    private struct FileState: Codable, Sendable {
        var revision: Int
        var contentHash: String
    }

    private struct State: Codable, Sendable {
        var cursor = 0
        var files: [String: FileState] = [:]
    }

    private let root: URL
    private let fileManager: FileManager
    private let client: CloudSyncClient?
    private let stateURL: URL
    private var state: State

    var isConfigured: Bool { client != nil }

    init(root: URL, configuration: SyncConfiguration? = .current()) {
        self.root = root
        fileManager = .default
        client = configuration.map { CloudSyncClient(configuration: $0) }
        let metadata = root.appendingPathComponent(".mdbar", isDirectory: true)
        stateURL = metadata.appendingPathComponent("sync-state.json")
        if let data = try? Data(contentsOf: stateURL), let decoded = try? JSONDecoder().decode(State.self, from: data) {
            state = decoded
        } else {
            state = State()
        }
    }

    @discardableResult
    func synchronize() async throws -> Bool {
        guard let client else { return false }
        try fileManager.createDirectory(at: stateURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        var changedLocalFiles = false

        while true {
            let response = try await client.changes(since: state.cursor)
            let latest = Dictionary(grouping: response.changes, by: \.path).compactMapValues { $0.last }
            for change in latest.values.sorted(by: { $0.sequence < $1.sequence }) {
                changedLocalFiles = try apply(change) || changedLocalFiles
            }
            state.cursor = response.cursor
            try saveState()
            if response.changes.count < 1_000 { break }
        }

        for (path, content) in try localNotes() {
            let hash = ContentDigest.sha256(content)
            guard state.files[path]?.contentHash != hash else { continue }
            try await upload(path: path, content: content, client: client)
        }

        let localPaths = Set(try localNotes().map(\.0))
        let deletedFiles = state.files.filter { path, fileState in
            !fileState.contentHash.isEmpty && !localPaths.contains(path)
        }
        for (path, fileState) in deletedFiles {
            do {
                let deleted = try await client.delete(path: path, baseRevision: fileState.revision)
                state.files[path] = FileState(revision: deleted.revision, contentHash: "")
            } catch let CloudSyncError.conflict(remote) {
                if let remote {
                    state.files[path] = FileState(
                        revision: remote.revision,
                        contentHash: remote.deleted ? "" : ContentDigest.sha256(remote.content ?? "")
                    )
                    if !remote.deleted {
                        let deleted = try await client.delete(path: path, baseRevision: remote.revision)
                        state.files[path] = FileState(revision: deleted.revision, contentHash: "")
                    }
                }
            }
        }
        try saveState()
        return changedLocalFiles
    }

    private func apply(_ change: RemoteChange) throws -> Bool {
        let url = root.appendingPathComponent(change.path)
        let localContent = try? String(contentsOf: url, encoding: .utf8)
        let localHash = localContent.map(ContentDigest.sha256)
        let known = state.files[change.path]
        let locallyModified = localHash != nil && localHash != known?.contentHash

        if change.deleted {
            if locallyModified {
                state.files[change.path] = FileState(revision: change.revision, contentHash: "")
                return false
            }
            if fileManager.fileExists(atPath: url.path) { try fileManager.removeItem(at: url) }
            state.files[change.path] = FileState(revision: change.revision, contentHash: "")
            return localContent != nil
        }

        let remoteContent = change.content ?? ""
        let remoteHash = ContentDigest.sha256(remoteContent)
        if locallyModified && localHash != remoteHash {
            try writeConflict(content: remoteContent, originalPath: change.path)
            state.files[change.path] = FileState(revision: change.revision, contentHash: remoteHash)
            return true
        }

        if localHash != remoteHash {
            try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try remoteContent.write(to: url, atomically: true, encoding: .utf8)
        }
        state.files[change.path] = FileState(revision: change.revision, contentHash: remoteHash)
        return localHash != remoteHash
    }

    private func upload(path: String, content: String, client: CloudSyncClient) async throws {
        let baseRevision = state.files[path]?.revision ?? 0
        do {
            let remote = try await client.put(path: path, content: content, baseRevision: baseRevision)
            state.files[path] = FileState(revision: remote.revision, contentHash: ContentDigest.sha256(content))
        } catch let CloudSyncError.conflict(current) {
            guard let current else { throw CloudSyncError.conflict(nil) }
            if !current.deleted, let remoteContent = current.content, remoteContent != content {
                try writeConflict(content: remoteContent, originalPath: path)
            }
            let remote = try await client.put(path: path, content: content, baseRevision: current.revision)
            state.files[path] = FileState(revision: remote.revision, contentHash: ContentDigest.sha256(content))
        }
    }

    private func localNotes() throws -> [(String, String)] {
        var result: [(String, String)] = []
        for directory in ["daily", "notes"] {
            let directoryURL = root.appendingPathComponent(directory, isDirectory: true)
            guard let enumerator = fileManager.enumerator(
                at: directoryURL,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles]
            ) else { continue }
            for case let url as URL in enumerator where url.pathExtension.lowercased() == "md" {
                let path = url.path.replacingOccurrences(of: root.path + "/", with: "")
                result.append((path, try String(contentsOf: url, encoding: .utf8)))
            }
        }
        return result
    }

    private func writeConflict(content: String, originalPath: String) throws {
        let original = URL(fileURLWithPath: originalPath)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let name = original.deletingPathExtension().lastPathComponent
            + ".conflict-cloud-" + formatter.string(from: .now) + ".md"
        let relativeDirectory = original.deletingLastPathComponent().relativePath
        let conflict = root.appendingPathComponent(relativeDirectory).appendingPathComponent(name)
        try fileManager.createDirectory(at: conflict.deletingLastPathComponent(), withIntermediateDirectories: true)
        try content.write(to: conflict, atomically: true, encoding: .utf8)
    }

    private func saveState() throws {
        let data = try JSONEncoder().encode(state)
        try data.write(to: stateURL, options: .atomic)
    }
}
