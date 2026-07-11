import XCTest
@testable import mdbar

final class MarkdownTasksTests: XCTestCase {
    func testParsesTaskDirectives() {
        let content = "- [ ] Morning pages #reuse\n- [x] Call Alex #carry @remind(10:30)"
        let tasks = MarkdownTasks.parse(content, notePath: "daily/2026-07-10.md")
        XCTAssertEqual(tasks.count, 2)
        XCTAssertTrue(tasks[0].repeats)
        XCTAssertEqual(tasks[0].text, "Morning pages")
        XCTAssertTrue(tasks[1].carries)
        XCTAssertTrue(tasks[1].isCompleted)
        XCTAssertEqual(tasks[1].reminderTime, "10:30")
    }

    func testRolloverRepeatsAndCarriesOnlyUnfinished() {
        let content = [
            "- [x] Morning pages #reuse",
            "- [ ] Ship build #carry",
            "- [x] Already shipped #carry",
            "- [ ] Normal task"
        ].joined(separator: "\n")
        let lines = MarkdownTasks.rolloverLines(from: content, sourcePath: "daily/2026-07-09.md")
        XCTAssertEqual(lines, ["- [ ] Morning pages #reuse", "- [ ] Ship build #carry"])
    }

    func testTogglePreservesMarkdown() {
        let content = "- [ ] Ship build #carry"
        let task = MarkdownTasks.parse(content, notePath: "daily/2026-07-10.md")[0]
        XCTAssertEqual(MarkdownTasks.toggle(task: task, in: content), "- [x] Ship build #carry")
    }
}
