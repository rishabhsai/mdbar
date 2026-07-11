import SwiftUI
import WidgetKit

struct NextTaskWidget: Widget {
    let kind = "mdbar.next-task"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            NextTaskView(entry: entry)
                .mdbarWidgetBackground()
        }
        .configurationDisplayName("Next Task")
        .description("See your next unfinished task or today's progress.")
        .supportedFamilies([.accessoryInline, .accessoryRectangular, .accessoryCircular])
    }
}

struct NextTaskView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    private var next: MarkdownTask? {
        entry.snapshot.tasks.first { !$0.isCompleted }
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(
                value: Double(entry.snapshot.tasks.filter(\.isCompleted).count),
                in: 0...Double(max(entry.snapshot.tasks.count, 1))
            ) {
                Image(systemName: "checkmark")
            } currentValueLabel: {
                Text("\(entry.snapshot.tasks.filter(\.isCompleted).count)")
            }
            .gaugeStyle(.accessoryCircular)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label("UP NEXT", systemImage: "circle")
                    .font(.caption2.weight(.semibold))
                Text(next?.text ?? "All clear")
                    .font(.caption)
                    .lineLimit(2)
            }
        default:
            Text(next.map { "○ \($0.text)" } ?? "✓ All clear")
        }
    }
}
