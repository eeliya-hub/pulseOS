import SwiftUI

/// Home, in portrait.
///
/// The web lays this out as one landscape viewport that never scrolls: a hero on
/// the sky, then three ground columns side by side — Upcoming, Forecast, Launch.
/// A phone has no room for three columns, so they become three tabs. The thing
/// the web pulls out as the highlighted event stays pulled out, above the tabs,
/// because that is the one piece you open the app to see.
struct HomeView: View {
    @StateObject private var model = HomeModel()
    @EnvironmentObject private var sky: SkyModel

    enum Tab: Hashable { case today, upcoming, forecast }
    @State private var tab: Tab = .today

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 10) {
                (Text(model.greeting)
                    .font(PulseFont.hero(36))
                    .foregroundStyle(Theme.moon)
                 + Text(" ")
                 + Text(model.settings.name)
                    .font(PulseFont.heroItalic(36))
                    .foregroundStyle(sky.phase.accent.opacity(0.92)))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                Text(model.todayLine)
                    .font(PulseFont.lede)
                    .foregroundStyle(Theme.haze)

                AskPulseField()
                    .padding(.top, 4)
            }
        } ground: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let next = model.next {
                        HighlightedEvent(entry: next, accent: sky.phase.accent)
                    }

                    SegTabs(
                        items: [(.today, "Today"), (.upcoming, "Upcoming"), (.forecast, "Forecast")],
                        selection: $tab,
                        accent: sky.phase.accent
                    )

                    switch tab {
                    case .today: rows(model.today)
                    case .upcoming: rows(model.upcoming)
                    case .forecast: ForecastPanel()
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder
    private func rows(_ entries: [Sample.Entry]) -> some View {
        if entries.isEmpty {
            Text("Nothing here.")
                .font(PulseFont.body)
                .foregroundStyle(Theme.dim)
                .padding(.vertical, 8)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    GroundRow(
                        lead: entry.allDay ? "All day" : entry.start.formatted(date: .omitted, time: .shortened),
                        subLead: entry.start.formatted(.dateTime.weekday(.abbreviated)),
                        title: entry.title,
                        subtitle: entry.location,
                        tint: entry.tint
                    )
                    if index < entries.count - 1 { Hairline() }
                }
            }
        }
    }
}

/// The web calls this the highlighted event and gives it the largest type on the
/// screen after the greeting. It keeps that billing here.
private struct HighlightedEvent: View {
    let entry: Sample.Entry
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Circle().fill(entry.tint).frame(width: 7, height: 7)
                Text("Highlighted event")
                    .font(PulseFont.label)
                    .foregroundStyle(Theme.moon.opacity(0.7))
                Spacer()
                Text(entry.start, style: .relative)
                    .font(PulseFont.micro)
                    .foregroundStyle(accent.opacity(0.9))
                    .fixedSize()
            }

            Text(entry.title)
                .font(PulseFont.hero(27))
                .foregroundStyle(Theme.moon)
                .lineLimit(2)

            HStack(spacing: 10) {
                Text(window)
                    .font(PulseFont.body)
                    .foregroundStyle(Theme.haze)
                if let location = entry.location {
                    Text("·").foregroundStyle(Theme.dim)
                    Text(location)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                        .lineLimit(1)
                }
            }
        }
        .padding(.leading, 13)
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(entry.tint)
                .frame(width: 3)
        }
    }

    private var window: String {
        if entry.allDay { return "All day" }
        let start = entry.start.formatted(date: .omitted, time: .shortened)
        guard let end = entry.end else { return start }
        return "\(start) – \(end.formatted(date: .omitted, time: .shortened))"
    }
}

/// Home's forecast tab: today's reading, then the week. The full detail lives in
/// the Weather section.
private struct ForecastPanel: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(Sample.currentTemp)°")
                    .font(PulseFont.hero(46))
                    .foregroundStyle(Theme.moon)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Sample.currentCondition)
                        .font(PulseFont.body)
                        .foregroundStyle(Theme.moon.opacity(0.9))
                    Text(Sample.city)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                }
                Spacer()
                Image(systemName: WeatherIcon.symbol(Sample.currentIcon))
                    .font(.system(size: 30, weight: .light))
                    .foregroundStyle(Theme.moon.opacity(0.75))
            }

            VStack(spacing: 0) {
                ForEach(Array(Sample.days.prefix(5).enumerated()), id: \.element.id) { i, day in
                    DayRow(day: day, isToday: i == 0)
                    if i < 4 { Hairline() }
                }
            }
        }
    }
}

struct DayRow: View {
    let day: Sample.Day
    var isToday: Bool = false

    private static let range = 8.0...26.0

    var body: some View {
        HStack(spacing: 12) {
            Text(isToday ? "Today" : day.date.formatted(.dateTime.weekday(.abbreviated)))
                .font(PulseFont.body)
                .foregroundStyle(Theme.moon.opacity(isToday ? 0.95 : 0.7))
                .frame(width: 54, alignment: .leading)

            Image(systemName: WeatherIcon.symbol(day.icon))
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(Theme.moon.opacity(0.65))
                .frame(width: 22)

            Text("\(day.low)°")
                .font(PulseFont.figures(13))
                .foregroundStyle(Theme.dim)

            // The temperature range as a bar, the way the web draws it: the day
            // is read by comparing bars, not by reading two numbers.
            GeometryReader { geo in
                let span = Self.range.upperBound - Self.range.lowerBound
                let x0 = (Double(day.low) - Self.range.lowerBound) / span
                let x1 = (Double(day.high) - Self.range.lowerBound) / span
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08)).frame(height: 3)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: 0x7dd3fc), Color(hex: 0xfbbf24)],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: max(6, geo.size.width * (x1 - x0)), height: 3)
                        .offset(x: geo.size.width * x0)
                }
                .frame(height: geo.size.height, alignment: .center)
            }
            .frame(height: 16)

            Text("\(day.high)°")
                .font(PulseFont.figures(13))
                .foregroundStyle(Theme.moon.opacity(0.92))
        }
        .padding(.vertical, 9)
    }
}

/// The way into the assistant.
struct AskPulseField: View {
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
        .background(Capsule().fill(Color.white.opacity(0.07)))
        .overlay(Capsule().stroke(Color.white.opacity(0.09), lineWidth: 1))
    }
}

/// OpenWeather's icon ids mapped onto SF Symbols.
enum WeatherIcon {
    static func symbol(_ icon: String?) -> String {
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
