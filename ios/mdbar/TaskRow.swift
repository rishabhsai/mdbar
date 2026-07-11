import SwiftUI

struct TaskRow: View {
    let task: MarkdownTask
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: task.isCompleted ? "checkmark.square.fill" : "square")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(task.isCompleted ? MDTheme.accent : MDTheme.secondary)
                    .contentTransition(.symbolEffect(.replace))
                Text(task.text)
                    .font(.body)
                    .strikethrough(task.isCompleted, color: MDTheme.secondary)
                    .foregroundStyle(task.isCompleted ? MDTheme.secondary : MDTheme.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if task.repeats {
                    Image(systemName: "arrow.trianglehead.2.clockwise.rotate.90")
                        .accessibilityLabel("Repeats daily")
                } else if task.carries {
                    Image(systemName: "arrow.forward")
                        .accessibilityLabel("Carries forward")
                }
                if task.reminderTime != nil {
                    Image(systemName: "bell")
                        .accessibilityLabel("Has reminder")
                }
            }
            .font(.caption)
            .foregroundStyle(MDTheme.accent)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(task.text), \(task.isCompleted ? "completed" : "not completed")")
    }
}
