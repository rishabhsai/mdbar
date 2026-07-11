import SwiftUI
import WidgetKit

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: .now, snapshot: previewSnapshot)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: .now, snapshot: context.isPreview ? previewSnapshot : SnapshotStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let entry = SnapshotEntry(date: .now, snapshot: SnapshotStore.load())
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
    }

    private var previewSnapshot: WidgetSnapshot {
        WidgetSnapshot(
            generatedAt: .now,
            dateLabel: "Tuesday, May 20",
            noteExcerpt: "Slow morning. Coffee outside and a clear plan for the day.",
            wordCount: 28,
            tasks: [
                MarkdownTask(id: "1", notePath: "daily/2026-05-20.md", lineIndex: 0, text: "Morning pages", isCompleted: false, repeats: true, carries: false, reminderTime: nil),
                MarkdownTask(id: "2", notePath: "daily/2026-05-20.md", lineIndex: 1, text: "Reply to Alex", isCompleted: false, repeats: false, carries: true, reminderTime: nil),
                MarkdownTask(id: "3", notePath: "daily/2026-05-20.md", lineIndex: 2, text: "Design onboarding flow", isCompleted: false, repeats: false, carries: false, reminderTime: nil),
                MarkdownTask(id: "4", notePath: "daily/2026-05-20.md", lineIndex: 3, text: "Workout", isCompleted: true, repeats: true, carries: false, reminderTime: nil)
            ]
        )
    }
}

struct WidgetTaskRow: View {
    let task: MarkdownTask
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 6 : 9) {
            Button(intent: ToggleTaskIntent(notePath: task.notePath, lineIndex: task.lineIndex)) {
                Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: compact ? 14 : 17, weight: .regular))
                    .foregroundStyle(task.isCompleted ? MDTheme.accent : MDTheme.ink)
            }
            .buttonStyle(.plain)
            Text(task.text)
                .font(compact ? .caption2 : .caption)
                .strikethrough(task.isCompleted)
                .foregroundStyle(task.isCompleted ? MDTheme.secondary : MDTheme.ink)
                .lineLimit(1)
            Spacer(minLength: 2)
            if task.repeats {
                Image(systemName: "arrow.trianglehead.2.clockwise.rotate.90")
                    .font(.system(size: 9))
                    .foregroundStyle(MDTheme.accent)
            } else if task.carries {
                Image(systemName: "arrow.forward")
                    .font(.system(size: 9))
                    .foregroundStyle(MDTheme.accent)
            }
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 19 : 25)
    }
}

extension View {
    func mdbarWidgetBackground() -> some View {
        containerBackground(for: .widget) { MDTheme.surface }
    }
}
