import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: NotebookStore
    @State private var selectedTab = ProcessInfo.processInfo.arguments.contains("--notes") ? 1 : 0

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                TodayView()
            }
            .tabItem { Label("Today", systemImage: "calendar.badge.checkmark") }
            .tag(0)

            NavigationStack {
                NotesView()
            }
            .tabItem { Label("Notes", systemImage: "folder") }
            .tag(1)
        }
        .mdbarCanvas()
        .overlay(alignment: .top) {
            if let error = store.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(MDTheme.accent, in: Capsule())
                    .padding(.top, 8)
                    .accessibilityAddTraits(.isStaticText)
            }
        }
    }
}
