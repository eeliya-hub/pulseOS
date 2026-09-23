import SwiftUI

/// The sky behind the dashboard.
///
/// Its colour is the hour's: a peach dawn, a clear blue day, an ember dusk, an
/// indigo night with a few stars. Ported from the web app's `hooks/useSky.js`,
/// same phases and same hex values, so the two read as one product.
enum SkyPhase: String {
    case dawn, day, dusk, night

    /// Which part of the day a moment belongs to.
    static func current(_ date: Date = .now, calendar: Calendar = .current) -> SkyPhase {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        let hour = Double(parts.hour ?? 0) + Double(parts.minute ?? 0) / 60
        switch hour {
        case 5..<8: return .dawn
        case 8..<17: return .day
        case 17..<20.5: return .dusk
        default: return .night
        }
    }

    var a: Color { Color(hex: raw.a) }
    var b: Color { Color(hex: raw.b) }
    var c: Color { Color(hex: raw.c) }
    var accent: Color { Color(hex: raw.accent) }
    var stars: Double { raw.stars }

    private var raw: (a: UInt32, b: UInt32, c: UInt32, accent: UInt32, stars: Double) {
        switch self {
        case .dawn:  return (0x2a2450, 0xb56a7c, 0xdba175, 0xffc9a3, 0.08)
        case .day:   return (0x113a6e, 0x285f98, 0x3d8aa6, 0xb9e4ff, 0.00)
        case .dusk:  return (0x221747, 0x8f4368, 0xc56b4c, 0xffb59c, 0.20)
        case .night: return (0x161a44, 0x392658, 0x0d3450, 0xa9bbff, 0.55)
        }
    }
}

/// Keeps the sky on the hour while the app is open.
@MainActor
final class SkyModel: ObservableObject {
    @Published private(set) var phase: SkyPhase = .current()
    private var timer: Timer?

    init() {
        // A minute is fine: the phases are hours long, and the crossfade hides
        // the step.
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.phase = .current() }
        }
    }

    deinit { timer?.invalidate() }
}

/// The background itself: three pools of the hour's colour over near-black, with
/// stars that only show once the evening is far enough along to have them.
struct SkyView: View {
    let phase: SkyPhase

    var body: some View {
        ZStack {
            Theme.ink
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                ZStack {
                    pool(phase.a, opacity: 0.85)
                        .frame(width: w * 1.6, height: h * 0.9)
                        .position(x: w * 0.18, y: h * 0.04)
                    pool(phase.b, opacity: 0.7)
                        .frame(width: w * 1.5, height: h * 0.8)
                        .position(x: w * 0.92, y: h * 0.2)
                    pool(phase.c, opacity: 0.55)
                        .frame(width: w * 1.7, height: h * 0.6)
                        .position(x: w * 0.5, y: h * 0.52)
                }
                if phase.stars > 0 {
                    Stars(opacity: phase.stars)
                }
            }
            // The ground end of the screen is always darker than the sky end,
            // whatever hour it is — that is what keeps the horizon readable.
            LinearGradient(
                colors: [.clear, Theme.ink.opacity(0.55), Theme.ink.opacity(0.92)],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 1.2), value: phase)
    }

    private func pool(_ colour: Color, opacity: Double) -> some View {
        RadialGradient(
            colors: [colour.opacity(opacity), colour.opacity(0)],
            center: .center,
            startRadius: 0,
            endRadius: 340
        )
        .blur(radius: 40)
    }
}

/// A fixed field of stars. Seeded, so they do not dance between redraws.
private struct Stars: View {
    let opacity: Double

    /// Seeded rather than random: the stars have to be in the same place on
    /// every redraw, or they crawl.
    private static let points: [(x: Double, y: Double, r: Double, a: Double)] = {
        var seed: UInt64 = 0x5EED
        func next() -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double((seed >> 33) % 10_000) / 10_000
        }
        return (0..<90).map { _ in
            (x: next(), y: next() * 0.7, r: 0.5 + next() * 1.1, a: 0.25 + next() * 0.75)
        }
    }()

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(Array(Self.points.enumerated()), id: \.offset) { _, p in
                    Circle()
                        .fill(Theme.moon.opacity(p.a * opacity))
                        .frame(width: p.r * 2, height: p.r * 2)
                        .position(x: p.x * geo.size.width, y: p.y * geo.size.height)
                }
            }
        }
        .allowsHitTesting(false)
    }
}
