import SwiftUI

/// The tokens the web app is drawn in, carried across unchanged so the two
/// read as one product. Names match `:root` in `frontend/src/assets/styles.css`.
enum Theme {
    static let ink = Color(hex: 0x0a0d1c)
    static let moon = Color(hex: 0xeef0fa)
    static let haze = Color(hex: 0xe2e6f8).opacity(0.66)
    static let dim = Color(hex: 0xe2e6f8).opacity(0.42)
    static let faint = Color(hex: 0xe2e6f8).opacity(0.22)

    /// A hairline. The app's most-used structural device: it divides without
    /// boxing anything in.
    static let rule = Color(hex: 0xe8eefc).opacity(0.14)
}

/// The type scale, one role per size, ported from `@layer components` in the
/// stylesheet. Points rather than rem: the web scales its root font off the
/// viewport, which a phone has no use for.
///
/// Serif for what is read at a distance, the UI face for what is scanned up
/// close — the same split the web app makes.
enum PulseFont {
    private static let serif = "Newsreader16pt-Regular"
    private static let serifItalic = "Newsreader16pt-Italic"
    private static let sans = "SchibstedGrotesk-Regular"

    /// The one thing a view is about.
    static func hero(_ size: CGFloat = 40) -> Font { .custom(serif, size: size) }
    static func heroItalic(_ size: CGFloat = 40) -> Font { .custom(serifItalic, size: size) }

    /// A serif title inside the ground: an event, a track, a project.
    static let title = Font.custom(serif, size: 19)
    static let titleLarge = Font.custom(serif, size: 23)

    /// The line above the hero: where you are, what state it is in.
    static let eyebrow = Font.custom(sans, size: 13).weight(.medium)
    /// The sentence that sums a view up.
    static let lede = Font.custom(sans, size: 15)
    /// A label that says what something is, in plain sentence case.
    static let label = Font.custom(sans, size: 12).weight(.semibold)
    /// Ordinary text you read in a row.
    static let body = Font.custom(sans, size: 15)
    /// The quiet line under a title.
    static let meta = Font.custom(sans, size: 13)
    /// The smallest thing that still has to be read.
    static let micro = Font.custom(sans, size: 11)

    /// Figures that sit in a column: times, temperatures.
    static func figures(_ size: CGFloat) -> Font {
        .custom(sans, size: size).monospacedDigit()
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255,
            opacity: 1
        )
    }
}

/// The accent tick that heads every column in the app: a short accent bar in
/// the margin, so the eye finds the same edge in each one.
struct ColumnHead: View {
    let label: String
    var accent: Color

    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 1, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [accent, accent.opacity(0.1)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 2.5, height: 13)
            Text(label)
                .font(PulseFont.label)
                .foregroundStyle(Theme.moon.opacity(0.74))
            Spacer(minLength: 0)
        }
    }
}
