import SwiftUI

@main
struct mdbarApp: App {
    @StateObject private var store = NotebookStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .task {
                    await store.start()
                }
        }
    }
}
