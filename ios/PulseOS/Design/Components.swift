import SwiftUI

/// A pane on the ground: a quiet surface that groups without boxing things in.
/// The web's `.theme-card`, toned down for a screen this size.
struct Pane<Content: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(0.045))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
    }
}

/// In-view tabs, the app's pill group.
///
/// The reason this exists at all: a phone turns every one of these sections into
/// a long column, and Eeliya would rather switch than scroll. Anything that
/// would run past a screen gets split behind these.
struct SegTabs<T: Hashable>: View {
    let items: [(value: T, label: String)]
    @Binding var selection: T
    var accent: Color

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.value) { item in
                    let on = item.value == selection
                    Button {
                        withAnimation(.snappy(duration: 0.22)) { selection = item.value }
                    } label: {
                        Text(item.label)
                            .font(PulseFont.label)
                            .foregroundStyle(on ? Theme.ink : Theme.moon.opacity(0.72))
                            .padding(.horizontal, 13)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(on ? Theme.moon : Color.white.opacity(0.06))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 1)
        }
        .scrollClipDisabled()
    }
}

/// A row on the ground: a leading figure, a title, a quiet second line.
struct GroundRow<Trailing: View>: View {
    let lead: String
    var subLead: String?
    let title: String
    var subtitle: String?
    var tint: Color?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(lead)
                    .font(PulseFont.figures(13))
                    .foregroundStyle(Theme.moon.opacity(0.78))
                if let subLead {
                    Text(subLead)
                        .font(PulseFont.micro)
                        .foregroundStyle(Theme.dim)
                }
            }
            .frame(width: 52, alignment: .trailing)

            if let tint {
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(tint)
                    .frame(width: 2.5)
                    .padding(.vertical, 1)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(PulseFont.title)
                    .foregroundStyle(Theme.moon.opacity(0.94))
                    .lineLimit(1)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            trailing
        }
        .padding(.vertical, 8)
    }
}

extension GroundRow where Trailing == EmptyView {
    init(lead: String, subLead: String? = nil, title: String, subtitle: String? = nil, tint: Color? = nil) {
        self.init(lead: lead, subLead: subLead, title: title, subtitle: subtitle, tint: tint) { EmptyView() }
    }
}

/// A number with its label under it — the shape the web uses for trip facts and
/// weather details.
struct Stat: View {
    let value: String
    let label: String
    var emphasis: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(emphasis ? PulseFont.hero(26) : PulseFont.title)
                .foregroundStyle(Theme.moon)
            Text(label)
                .font(PulseFont.micro)
                .foregroundStyle(Theme.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A hairline that divides rows without drawing a box round them.
struct Hairline: View {
    var body: some View {
        Rectangle().fill(Theme.rule).frame(height: 1)
    }
}

/// A small circular control, the app's `.pill` at icon size.
struct IconPill: View {
    let system: String
    var size: CGFloat = 38
    var lit: Bool = false
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: size * 0.36, weight: .medium))
                .foregroundStyle(lit ? Theme.ink : Theme.moon.opacity(0.85))
                .frame(width: size, height: size)
                .background(Circle().fill(lit ? Theme.moon : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
    }
}

/// Rise/fall colouring, so a market number reads before it is parsed.
extension Color {
    static let rise = Color(hex: 0x4ade80)
    static let fall = Color(hex: 0xfb7185)
}

/// The view scaffold every section shares: sky at the top carrying the hero, a
/// horizon, then the ground. The same three parts as the web, stacked for a
/// phone instead of laid out across one landscape viewport.
struct Stage<Hero: View, Ground: View>: View {
    let phase: SkyPhase
    @ViewBuilder var hero: Hero
    @ViewBuilder var ground: Ground

    var body: some View {
        VStack(spacing: 0) {
            hero
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 22)
                .padding(.top, 10)
                .padding(.bottom, 18)

            Rectangle()
                .fill(Theme.rule)
                .frame(height: 1)
                .overlay(alignment: .leading) {
                    LinearGradient(
                        colors: [phase.accent.opacity(0.5), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: 120, height: 1)
                }

            ground
                .frame(maxWidth: .infinity)
                .background(
                    LinearGradient(
                        colors: [Theme.ink.opacity(0.22), Theme.ink.opacity(0.8)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
    }
}

/// The title every section but Home carries: an eyebrow, then the name of the
/// view set in the display face.
struct ViewTitle: View {
    let eyebrow: String
    let title: String
    var accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(eyebrow)
                .font(PulseFont.eyebrow)
                .foregroundStyle(accent.opacity(0.85))
            Text(title)
                .font(PulseFont.hero(34))
                .foregroundStyle(Theme.moon)
        }
    }
}
