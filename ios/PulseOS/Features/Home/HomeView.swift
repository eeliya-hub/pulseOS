import SwiftUI

/// Home, in portrait.
///
/// The web lays this out as one landscape viewport that never scrolls: a hero
/// on the sky, a horizon, then three ground columns side by side. A phone has
/// no room for three columns, so the columns become a stack and the ground
/// scrolls under a sky that does not. The grammar survives — sky, horizon,
/// ground, an accent tick at the head of each column — the arrangement does not.
struct HomeView: View {
    @StateObject private var model = HomeModel()
    @EnvironmentObject private var sky: SkyModel

    var body: some View {
        ZStack {
            SkyView(phase: sky.phase)

            VStack(spacing: 0) {
                TopBar()
                skyZone
                horizon
                ground
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    // MARK: Sky — what the day is

    private var skyZone: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(model.greeting)
                .font(PulseFont.hero(38))
                .foregroundStyle(Theme.moon)
            + Text(" ")
            + Text(model.settings.name)
                .font(PulseFont.heroItalic(38))
                // The name carries the hour's colour pushed toward a truer blue,
                // the way `.name-mark` does on the web.
                .foregroundStyle(sky.phase.accent.opacity(0.92))

            Text(model.todayLine)
                .font(PulseFont.lede)
                .foregroundStyle(Theme.haze)

            AskPulseField()
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 22)
    }

    private var horizon: some View {
        Rectangle()
            .fill(Theme.rule)
            .frame(height: 1)
            .overlay(alignment: .leading) {
                // A short lit run at the left end, the way the horizon is lit on
                // the web. Purely a light, not a measure of anything.
                LinearGradient(
                    colors: [sky.phase.accent.opacity(0.5), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: 120, height: 1)
            }
    }

    // MARK: Ground — what you do about it

    private var ground: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                if let next = model.next {
                    column("Next") {
                        NextEventCard(event: next, accent: sky.phase.accent)
                    }
                }

                if !model.upcoming.isEmpty {
                    column("Upcoming") {
                        VStack(spacing: 0) {
                            ForEach(Array(model.upcoming.prefix(6).enumerated()), id: \.offset) { i, event in
                                EventRow(event: event)
                                if i < min(6, model.upcoming.count) - 1 {
                                    Divider().overlay(Theme.rule)
                                }
                            }
                        }
                    }
                }

                if let weather = model.weather {
                    column("Forecast") {
                        ForecastPanel(weather: weather, points: model.forecast)
                    }
                }

                ForEach(model.problems, id: \.self) { problem in
                    Text(problem)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 22)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .background(
            LinearGradient(
                colors: [Theme.ink.opacity(0.22), Theme.ink.opacity(0.78)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private func column<Content: View>(
        _ label: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ColumnHead(label: label, accent: sky.phase.accent)
            content()
        }
    }
}

// MARK: - Pieces

private struct TopBar: View {
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
        .padding(.top, 6)
        .onReceive(tick) { now = $0 }
    }
}

/// The heartbeat the app is named for.
private struct PulseMark: View {
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

/// The way into the assistant. Inert in this slice — the assistant is its own.
private struct AskPulseField: View {
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 13))
                .foregroundStyle(Theme.moon.opacity(0.55))
            Text("Ask Pulse anything")
                .font(PulseFont.body)
                .foregroundStyle(Theme.moon.opacity(0.45))
            Spacer()
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 12)
        .background(
            Capsule().fill(Color.white.opacity(0.07))
        )
        .overlay(
            Capsule().stroke(Color.white.opacity(0.09), lineWidth: 1)
        )
    }
}

private struct NextEventCard: View {
    let event: Event
    let accent: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Color(hexString: event.color) ?? accent)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 5) {
                Text(event.title)
                    .font(PulseFont.titleLarge)
                    .foregroundStyle(Theme.moon)
                    .lineLimit(2)
                Text(Self.window(event))
                    .font(PulseFont.body)
                    .foregroundStyle(Theme.haze)
                if let location = event.location, !location.isEmpty {
                    Text(location)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Text(event.start, style: .relative)
                .font(PulseFont.micro)
                .foregroundStyle(Theme.dim)
                .fixedSize()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
    }

    private static func window(_ event: Event) -> String {
        if event.allDay == true { return "All day" }
        let start = event.start.formatted(date: .omitted, time: .shortened)
        guard let end = event.end else { return start }
        return "\(start) – \(end.formatted(date: .omitted, time: .shortened))"
    }
}

private struct EventRow: View {
    let event: Event

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(event.allDay == true ? "All day" : event.start.formatted(date: .omitted, time: .shortened))
                    .font(PulseFont.figures(13))
                    .foregroundStyle(Theme.moon.opacity(0.75))
                Text(event.start, format: .dateTime.weekday(.abbreviated))
                    .font(PulseFont.micro)
                    .foregroundStyle(Theme.dim)
            }
            .frame(width: 58, alignment: .trailing)

            Circle()
                .fill(Color(hexString: event.color) ?? Theme.faint)
                .frame(width: 6, height: 6)
                .padding(.top, 5)

            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(PulseFont.title)
                    .foregroundStyle(Theme.moon.opacity(0.94))
                    .lineLimit(1)
                if let location = event.location, !location.isEmpty {
                    Text(location)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 9)
    }
}

private struct ForecastPanel: View {
    let weather: Weather
    let points: [Forecast.Point]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(Int(weather.temp.rounded()))°")
                    .font(PulseFont.hero(44))
                    .foregroundStyle(Theme.moon)
                VStack(alignment: .leading, spacing: 2) {
                    Text((weather.description ?? weather.condition).capitalizedFirst)
                        .font(PulseFont.body)
                        .foregroundStyle(Theme.moon.opacity(0.9))
                    Text(weather.location)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                }
                Spacer(minLength: 0)
                Image(systemName: Self.symbol(weather.icon))
                    .font(.system(size: 26, weight: .light))
                    .foregroundStyle(Theme.moon.opacity(0.7))
            }

            if !points.isEmpty {
                HStack(spacing: 0) {
                    ForEach(points.prefix(5)) { point in
                        VStack(spacing: 6) {
                            Text(point.date, format: .dateTime.weekday(.abbreviated))
                                .font(PulseFont.micro)
                                .foregroundStyle(Theme.dim)
                            Image(systemName: Self.symbol(point.icon))
                                .font(.system(size: 14, weight: .light))
                                .foregroundStyle(Theme.moon.opacity(0.65))
                            Text("\(Int(point.temp.rounded()))°")
                                .font(PulseFont.figures(14))
                                .foregroundStyle(Theme.moon.opacity(0.88))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    /// OpenWeather's icon ids mapped onto SF Symbols.
    private static func symbol(_ icon: String?) -> String {
        guard let icon else { return "cloud" }
        let night = icon.hasSuffix("n")
        switch icon.prefix(2) {
        case "01": return night ? "moon.stars" : "sun.max"
        case "02": return night ? "cloud.moon" : "cloud.sun"
        case "03": return "cloud"
        case "04": return "smoke"
        case "09": return "cloud.drizzle"
        case "10": return night ? "cloud.moon.rain" : "cloud.sun.rain"
        case "11": return "cloud.bolt.rain"
        case "13": return "snowflake"
        case "50": return "cloud.fog"
        default: return "cloud"
        }
    }
}

// MARK: - Helpers

extension Color {
    /// Calendars hand back their colour as `#RRGGBB`.
    init?(hexString: String?) {
        guard var raw = hexString else { return nil }
        raw = raw.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard raw.count == 6, let value = UInt32(raw, radix: 16) else { return nil }
        self.init(hex: value)
    }
}

extension String {
    var capitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
