import Foundation

enum NotebookPaths {
    static let appGroup = "group.run.mdbar.app"
    static let iCloudContainer = "iCloud.run.mdbar.app"
    static let snapshotName = "widget-snapshot.json"

    static func root(fileManager: FileManager = .default) -> URL {
        if let cloud = fileManager.url(forUbiquityContainerIdentifier: iCloudContainer) {
            return cloud.appendingPathComponent("Documents", isDirectory: true)
        }
        return fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static func snapshotURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(snapshotName)
    }

    static func dailyURL(date: Date, root: URL? = nil) -> URL {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return (root ?? self.root())
            .appendingPathComponent("daily", isDirectory: true)
            .appendingPathComponent(formatter.string(from: date) + ".md")
    }
}
