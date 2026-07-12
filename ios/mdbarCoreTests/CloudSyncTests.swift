import XCTest
@testable import mdbar

final class CloudSyncTests: XCTestCase {
    func testEndpointPreservesNestedMarkdownPath() {
        let configuration = SyncConfiguration(
            baseURL: URL(string: "https://sync.example.com")!,
            spaceID: String(repeating: "a", count: 64),
            token: "secret"
        )

        XCTAssertEqual(
            configuration.endpoint("notes/notes/projects/road map.md").absoluteString,
            "https://sync.example.com/v1/spaces/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/notes/notes/projects/road%20map.md"
        )
    }

    func testContentDigestIsStable() {
        XCTAssertEqual(
            ContentDigest.sha256("mdbar"),
            "5e3c708461bf49f6fcebc1c38cb8db08ede61a3180571374472e5c62da47e816"
        )
    }
}
