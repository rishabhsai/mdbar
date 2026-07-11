import SwiftUI
import WidgetKit

@main
struct mdbarWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        DailyNoteWidget()
        NextTaskWidget()
    }
}
