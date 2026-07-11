import SwiftUI
import WidgetKit

struct DailyNoteWidget: Widget {
    let kind = "mdbar.daily-note"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapshotProvider()) { entry in
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("DAILY NOTE")
                        .font(.caption2.weight(.semibold))
                    Spacer()
                    Text(entry.snapshot.dateLabel)
                        .font(.caption2)
                        .foregroundStyle(MDTheme.secondary)
                }
                Text(entry.snapshot.noteExcerpt)
                    .font(.callout)
                    .foregroundStyle(MDTheme.ink)
                    .lineLimit(4)
                Spacer()
                Text("\(entry.snapshot.wordCount) words")
                    .font(.caption2)
                    .foregroundStyle(MDTheme.secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .mdbarWidgetBackground()
        }
        .configurationDisplayName("Daily Note")
        .description("Keep today's writing in view.")
        .supportedFamilies([.systemMedium])
    }
}
