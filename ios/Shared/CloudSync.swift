import CryptoKit
import Foundation

struct SyncConfiguration: Sendable {
    let baseURL: URL
    let spaceID: String
    let token: String

    static func current(bundle: Bundle = .main) -> SyncConfiguration? {
        guard
            let rawURL = bundle.object(forInfoDictionaryKey: "MDBARSyncBaseURL") as? String,
            let baseURL = URL(string: rawURL.trimmingCharacters(in: .whitespacesAndNewlines)),
            let spaceID = (bundle.object(forInfoDictionaryKey: "MDBARSyncSpaceID") as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            let token = (bundle.object(forInfoDictionaryKey: "MDBARSyncToken") as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            spaceID.count == 64,
            !token.isEmpty
        else { return nil }
        return SyncConfiguration(baseURL: baseURL, spaceID: spaceID, token: token)
    }

    func endpoint(_ path: String, queryItems: [URLQueryItem] = []) -> URL {
        var url = baseURL
            .appendingPathComponent("v1")
            .appendingPathComponent("spaces")
            .appendingPathComponent(spaceID)
        for component in path.split(separator: "/") {
            url.appendPathComponent(String(component))
        }
        guard !queryItems.isEmpty, var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.queryItems = queryItems
        return components.url ?? url
    }
}

struct RemoteNote: Codable, Sendable {
    let path: String
    let revision: Int
    let modifiedAt: String
    let deleted: Bool
    let content: String?
}

struct RemoteChange: Codable, Sendable {
    let sequence: Int
    let path: String
    let revision: Int
    let modifiedAt: String
    let deleted: Bool
    let content: String?
}

struct RemoteChanges: Codable, Sendable {
    let cursor: Int
    let changes: [RemoteChange]
}

private struct RemoteErrorBody: Codable {
    let error: String
    let current: RemoteNote?
}

enum CloudSyncError: LocalizedError, Sendable {
    case invalidResponse
    case requestFailed(Int, String)
    case conflict(RemoteNote?)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The sync server returned an invalid response."
        case let .requestFailed(status, message):
            "Sync failed (\(status)): \(message)"
        case .conflict:
            "The note changed on another device."
        }
    }
}

struct CloudSyncClient: Sendable {
    let configuration: SyncConfiguration
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(configuration: SyncConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
    }

    func changes(since cursor: Int) async throws -> RemoteChanges {
        try await send(
            url: configuration.endpoint("changes", queryItems: [URLQueryItem(name: "since", value: String(cursor))]),
            method: "GET",
            body: Optional<String>.none
        )
    }

    func note(path: String) async throws -> RemoteNote {
        try await send(url: configuration.endpoint("notes/\(path)"), method: "GET", body: Optional<String>.none)
    }

    func today(date: String) async throws -> RemoteNote {
        try await send(
            url: configuration.endpoint("today", queryItems: [URLQueryItem(name: "date", value: date)]),
            method: "GET",
            body: Optional<String>.none
        )
    }

    func put(path: String, content: String, baseRevision: Int, idempotencyKey: String = UUID().uuidString) async throws -> RemoteNote {
        try await send(
            url: configuration.endpoint("notes/\(path)"),
            method: "PUT",
            body: PutBody(
                baseRevision: baseRevision,
                content: content,
                modifiedAt: ISO8601DateFormatter().string(from: .now),
                idempotencyKey: idempotencyKey
            )
        )
    }

    func delete(path: String, baseRevision: Int, idempotencyKey: String = UUID().uuidString) async throws -> RemoteNote {
        try await send(
            url: configuration.endpoint("notes/\(path)"),
            method: "DELETE",
            body: DeleteBody(
                baseRevision: baseRevision,
                modifiedAt: ISO8601DateFormatter().string(from: .now),
                idempotencyKey: idempotencyKey
            )
        )
    }

    private func send<ResponseBody: Decodable, RequestBody: Encodable>(
        url: URL,
        method: String,
        body: RequestBody?
    ) async throws -> ResponseBody {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(configuration.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CloudSyncError.invalidResponse }
        if http.statusCode == 409 {
            throw CloudSyncError.conflict(try? decoder.decode(RemoteErrorBody.self, from: data).current)
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(RemoteErrorBody.self, from: data).error) ?? "unknown_error"
            throw CloudSyncError.requestFailed(http.statusCode, message)
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }

    private struct PutBody: Codable {
        let baseRevision: Int
        let content: String
        let modifiedAt: String
        let idempotencyKey: String
    }

    private struct DeleteBody: Codable {
        let baseRevision: Int
        let modifiedAt: String
        let idempotencyKey: String
    }
}

enum ContentDigest {
    static func sha256(_ content: String) -> String {
        SHA256.hash(data: Data(content.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
