import SwiftUI

enum MDTheme {
    static let canvas = Color(red: 0.055, green: 0.052, blue: 0.048)
    static let surface = Color(red: 0.09, green: 0.084, blue: 0.077)
    static let raised = Color(red: 0.125, green: 0.116, blue: 0.106)
    static let ink = Color(red: 0.84, green: 0.79, blue: 0.72)
    static let secondary = Color(red: 0.58, green: 0.55, blue: 0.51)
    static let faint = Color(red: 0.32, green: 0.30, blue: 0.28)
    static let accent = Color(red: 0.72, green: 0.40, blue: 0.28)
    static let divider = Color.white.opacity(0.085)
}

extension View {
    func mdbarCanvas() -> some View {
        foregroundStyle(MDTheme.ink)
            .background(MDTheme.canvas.ignoresSafeArea())
            .tint(MDTheme.accent)
    }
}
