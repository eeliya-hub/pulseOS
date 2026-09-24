import SwiftUI

/// Weather — the tab that replaces Launchpad, which was macOS-only.
///
/// The web never gave weather a view of its own; it lives as a card on Home and
/// a strip on Markets. This takes the same readings and gives them the room the
/// phone has: the current temperature stays the largest thing on the screen, and
/// the three long lists behind it — hourly, the week, the details — are tabs
/// rather than one column you scroll through.
struct WeatherView: View {
    @EnvironmentObject private var sky: SkyModel

    enum Tab: Hashable { case hourly, week, details }
    @State private var tab: Tab = .hourly

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 6) {
                Text(Sample.city)
                    .font(PulseFont.eyebrow)
                    .foregroundStyle(sky.phase.accent.opacity(0.85))

                HStack(alignment: .top, spacing: 14) {
                    Text("\(Sample.currentTemp)°")
                        .font(PulseFont.hero(66))
                        .foregroundStyle(Theme.moon)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(Sample.currentCondition)
                            .font(PulseFont.lede)
                            .foregroundStyle(Theme.moon.opacity(0.9))
                        Text("Feels \(Sample.feelsLike)°  ·  H \(Sample.days[0].high)°  L \(Sample.days[0].low)°")
                            .font(PulseFont.meta)
                            .foregroundStyle(Theme.dim)
                    }
                    .padding(.top, 12)
                    Spacer()
                    Image(systemName: WeatherIcon.symbol(Sample.currentIcon))
                        .font(.system(size: 34, weight: .ultraLight))
                        .foregroundStyle(Theme.moon.opacity(0.75))
                        .padding(.top, 10)
                }
            }
        } ground: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SegTabs(
                        items: [(.hourly, "Hourly"), (.week, "7 days"), (.details, "Details")],
                        selection: $tab,
                        accent: sky.phase.accent
                    )

                    switch tab {
                    case .hourly: hourly
                    case .week: week
                    case .details: details
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var hourly: some View {
        VStack(alignment: .leading, spacing: 14) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(Array(Sample.hours.prefix(14).enumerated()), id: \.element.id) { i, hour in
                        VStack(spacing: 8) {
                            Text(i == 0 ? "Now" : hour.date.formatted(.dateTime.hour()))
                                .font(PulseFont.micro)
                                .foregroundStyle(Theme.dim)
                            Image(systemName: WeatherIcon.symbol(hour.icon))
                                .font(.system(size: 15, weight: .light))
                                .foregroundStyle(Theme.moon.opacity(0.7))
                            Text("\(hour.temp)°")
                                .font(PulseFont.figures(15))
                                .foregroundStyle(Theme.moon.opacity(0.95))
                            Text(hour.rain > 0 ? "\(hour.rain)%" : " ")
                                .font(PulseFont.micro)
                                .foregroundStyle(Color(hex: 0x7dd3fc).opacity(0.85))
                        }
                        .frame(width: 54)
                    }
                }
            }
            .scrollClipDisabled()

            Pane {
                VStack(alignment: .leading, spacing: 8) {
                    ColumnHead(label: "Next few hours", accent: sky.phase.accent)
                    Text("Cloud thickening through the afternoon, with a 60% chance of rain around 20:00. Staying mild — it does not drop below 14° tonight.")
                        .font(PulseFont.body)
                        .foregroundStyle(Theme.haze)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var week: some View {
        VStack(spacing: 0) {
            ForEach(Array(Sample.days.enumerated()), id: \.element.id) { i, day in
                DayRow(day: day, isToday: i == 0)
                if i < Sample.days.count - 1 { Hairline() }
            }
        }
    }

    private var details: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                detail("Feels like", "\(Sample.feelsLike)°", "thermometer.medium")
                detail("Humidity", "\(Sample.humidity)%", "humidity")
            }
            HStack(spacing: 12) {
                detail("Wind", "\(Sample.wind) mph", "wind")
                detail("Rain", "\(Sample.rainChance)%", "drop")
            }
            HStack(spacing: 12) {
                detail("UV index", "\(Sample.uvIndex)", "sun.max")
                detail("Air quality", "\(Sample.airQuality)", "aqi.medium")
            }
            HStack(spacing: 12) {
                detail("Sunrise", Sample.sunrise.formatted(date: .omitted, time: .shortened), "sunrise")
                detail("Sunset", Sample.sunset.formatted(date: .omitted, time: .shortened), "sunset")
            }
        }
    }

    private func detail(_ label: String, _ value: String, _ symbol: String) -> some View {
        Pane {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: symbol)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.dim)
                    Text(label)
                        .font(PulseFont.micro)
                        .foregroundStyle(Theme.dim)
                }
                Text(value)
                    .font(PulseFont.hero(24))
                    .foregroundStyle(Theme.moon)
            }
        }
    }
}
