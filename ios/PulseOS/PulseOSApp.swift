import SwiftUI

@main
struct PulseOSApp: App {
    @StateObject private var sky = SkyModel()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(sky)
                .preferredColorScheme(.dark)
                .tint(sky.phase.accent)
        }
    }
}
