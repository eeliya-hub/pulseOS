import SwiftUI

enum Section: Hashable, CaseIterable {
    case home, weather, life, pulse, markets, music, travel

    var label: String {
        switch self {
        case .home: "Home"
        case .weather: "Weather"
        case .life: "Life Hub"
        case .pulse: "Ask Pulse"
        case .markets: "Markets"
        case .music: "Music"
        case .travel: "Travel"
        }
    }

    init(argument: String?) {
        switch argument?.lowercased() {
        case "weather": self = .weather
        case "life", "lifehub": self = .life
        case "pulse", "ai", "assistant": self = .pulse
        case "markets", "news": self = .markets
        case "music": self = .music
        case "travel": self = .travel
        default: self = .home
        }
    }

    var icon: String {
        switch self {
        case .home: "house"
        case .weather: "cloud.sun"
        case .life: "calendar"
        case .pulse: "sparkles"
        case .markets: "newspaper"
        case .music: "music.note"
        case .travel: "location"
        }
    }
}

struct RootView: View {
    /// `-section markets` on launch opens straight to that tab. A development
    /// affordance: it is how the simulator is driven for screenshots, and how a
    /// single section gets exercised without tapping through to it.
    @State private var section: Section = Section(argument: UserDefaults.standard.string(forKey: "section"))
    @StateObject private var sky = SkyModel()

    var body: some View {
        ZStack {
            SkyView(phase: sky.phase)

            VStack(spacing: 0) {
                TopBar()

                Group {
                    switch section {
                    case .home: HomeView()
                    case .weather: WeatherView()
                    case .life: LifeHubView()
                    case .pulse: AssistantView()
                    case .markets: MarketsView()
                    case .music: MusicView()
                    case .travel: TravelView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // One orchestrated moment per change of view, the way the web
                // does its focus pull: opacity and offset only, nothing that
                // would fight the sky behind it.
                .transition(.opacity.combined(with: .offset(y: 6)))
                .id(section)

                Baseline(section: $section, accent: sky.phase.accent)
            }
        }
        .environmentObject(sky)
        .animation(.easeOut(duration: 0.28), value: section)
    }
}

/// The app's navigation: a hairline across the foot of the screen with the tabs
/// standing on it, and the assistant *as* the line at its centre rather than a
/// button on it. The web draws this as one measured SVG path; a phone has room
/// for seven icons and one lit word, so the beat carries the label.
private struct Baseline: View {
    @Binding var section: Section
    let accent: Color

    private let left: [Section] = [.home, .weather, .life]
    private let right: [Section] = [.markets, .music, .travel]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(left, id: \.self) { tab($0) }
            beat
            ForEach(right, id: \.self) { tab($0) }
        }
        .padding(.top, 10)
        .padding(.bottom, 4)
        .background(alignment: .top) {
            Rectangle().fill(Theme.rule).frame(height: 1)
        }
        .background(.ultraThinMaterial.opacity(0.4))
    }

    private func tab(_ item: Section) -> some View {
        let on = section == item
        return Button {
            section = item
        } label: {
            VStack(spacing: 4) {
                Image(systemName: item.icon)
                    .font(.system(size: 17, weight: on ? .semibold : .regular))
                    .foregroundStyle(on ? Theme.moon : Theme.moon.opacity(0.42))
                // Only the tab you are on is named — seven labels at once is
                // noise, and the underline is what the web uses to mark it.
                if on {
                    Text(item.label)
                        .font(PulseFont.micro)
                        .foregroundStyle(Theme.moon.opacity(0.8))
                } else {
                    Color.clear.frame(height: 13)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var beat: some View {
        let on = section == .pulse
        return Button {
            section = .pulse
        } label: {
            VStack(spacing: 2) {
                BeatTrace(accent: accent, lit: on)
                    .frame(width: 54, height: 22)
                Text("Ask Pulse")
                    .font(.custom("Newsreader16pt-Italic", size: 12))
                    .foregroundStyle(on ? Theme.moon : Theme.moon.opacity(0.7))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

/// The ECG beat at the centre of the baseline — the app's signature.
private struct BeatTrace: View {
    let accent: Color
    let lit: Bool

    var body: some View {
        Canvas { context, size in
            let midY = size.height * 0.62
            var path = Path()
            path.move(to: CGPoint(x: 0, y: midY))
            path.addLine(to: CGPoint(x: size.width * 0.26, y: midY))
            path.addLine(to: CGPoint(x: size.width * 0.36, y: midY - size.height * 0.16))
            path.addLine(to: CGPoint(x: size.width * 0.46, y: midY - size.height * 0.72))
            path.addLine(to: CGPoint(x: size.width * 0.57, y: midY + size.height * 0.3))
            path.addLine(to: CGPoint(x: size.width * 0.66, y: midY))
            path.addLine(to: CGPoint(x: size.width, y: midY))
            context.stroke(
                path,
                with: .color(lit ? accent : Theme.moon.opacity(0.55)),
                style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
            )
        }
    }
}

/// The app's own bar, above every view.
struct TopBar: View {
    @State private var now = Date.now
    private let tick = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack {
            HStack(spacing: 7) {
                PulseMark()
                Text("Pulse")
                    .font(PulseFont.title)
                    .foregroundStyle(Theme.moon.opacity(0.9))
            }
            Spacer()
            Text(now, format: .dateTime.weekday(.abbreviated).day().month(.abbreviated))
                .font(PulseFont.micro)
                .foregroundStyle(Theme.dim)
        }
        .padding(.horizontal, 22)
        .padding(.top, 4)
        .padding(.bottom, 2)
        .onReceive(tick) { now = $0 }
    }
}

/// The heartbeat the app is named for.
struct PulseMark: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            let midY = size.height / 2
            path.move(to: CGPoint(x: 0, y: midY))
            path.addLine(to: CGPoint(x: size.width * 0.3, y: midY))
            path.addLine(to: CGPoint(x: size.width * 0.42, y: midY - size.height * 0.42))
            path.addLine(to: CGPoint(x: size.width * 0.56, y: midY + size.height * 0.38))
            path.addLine(to: CGPoint(x: size.width * 0.68, y: midY))
            path.addLine(to: CGPoint(x: size.width, y: midY))
            context.stroke(
                path,
                with: .color(Theme.moon.opacity(0.85)),
                style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round)
            )
        }
        .frame(width: 26, height: 14)
    }
}
