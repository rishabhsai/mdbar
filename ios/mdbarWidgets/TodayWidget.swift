import SwiftUI
import WidgetKit

struct TodayWidget: Widget {
    let kind = "mdbar.today"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            TodayWidgetView(entry: entry)
                .mdbarWidgetBackground()
        }
        .configurationDisplayName("Today")
        .description("Check off tasks and glance at today's note.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        if family == .systemLarge {
            HStack(alignment: .top, spacing: 14) {
                taskList(limit: 6)
                Divider().overlay(MDTheme.divider)
                noteExcerpt
            }
        } else {
            taskList(limit: family == .systemSmall ? 3 : 4)
        }
    }

    private func taskList(limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(family == .systemSmall ? "UP NEXT" : "TODAY")
                    .font(.caption2.weight(.semibold))
                Spacer()
                Text(progress)
                    .font(.caption2)
                    .foregroundStyle(MDTheme.secondary)
            }
            ForEach(Array(entry.snapshot.tasks.prefix(limit))) { task in
                WidgetTaskRow(task: task, compact: family == .systemSmall)
            }
            if entry.snapshot.tasks.isEmpty {
                Text("Nothing waiting.")
                    .font(.caption)
                    .foregroundStyle(MDTheme.secondary)
                    .padding(.top, 10)
            }
        }
    }

    private var noteExcerpt: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.snapshot.dateLabel.uppercased())
                .font(.caption2.weight(.semibold))
            Text(entry.snapshot.noteExcerpt)
                .font(.caption)
                .foregroundStyle(MDTheme.ink)
                .lineLimit(7)
            Spacer()
            Text("\(entry.snapshot.wordCount) words")
                .font(.caption2)
                .foregroundStyle(MDTheme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var progress: String {
        "\(entry.snapshot.tasks.filter(\.isCompleted).count) of \(entry.snapshot.tasks.count)"
    }
}
