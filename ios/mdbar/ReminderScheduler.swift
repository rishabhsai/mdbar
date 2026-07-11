import Foundation
import UserNotifications

enum ReminderScheduler {
    static func requestAuthorization() async {
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
    }

    static func sync(tasks: [MarkdownTask]) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let oldIDs = pending.map(\.identifier).filter { $0.hasPrefix("mdbar.task.") }
        center.removePendingNotificationRequests(withIdentifiers: oldIDs)

        let reminders = tasks.filter { !$0.isCompleted && $0.reminderTime != nil }
        guard !reminders.isEmpty else { return }
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            await requestAuthorization()
        }

        for task in reminders {
            guard let time = task.reminderTime,
                  let components = parsed(time),
                  let date = Calendar.autoupdatingCurrent.date(
                    bySettingHour: components.hour ?? 9,
                    minute: components.minute ?? 0,
                    second: 0,
                    of: .now
                  ), date > .now else { continue }
            let content = UNMutableNotificationContent()
            content.title = "Today"
            content.body = task.text
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(
                dateMatching: Calendar.autoupdatingCurrent.dateComponents(
                    [.year, .month, .day, .hour, .minute],
                    from: date
                ),
                repeats: false
            )
            try? await center.add(
                UNNotificationRequest(
                    identifier: "mdbar.task.\(task.id)",
                    content: content,
                    trigger: trigger
                )
            )
        }
    }

    private static func parsed(_ value: String) -> DateComponents? {
        let pieces = value.split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2,
              (0...23).contains(pieces[0]),
              (0...59).contains(pieces[1]) else { return nil }
        return DateComponents(hour: pieces[0], minute: pieces[1])
    }
}
