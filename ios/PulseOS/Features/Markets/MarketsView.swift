import SwiftUI

/// Markets & News.
///
/// The web hangs a scrolling price tape between the sky and the ground, puts the
/// live channel in one ground column and a News/Sport/Markets switcher in the
/// other. The tape and the switcher both survive; the channel becomes a tile at
/// the top of the ground, because on a phone a video is the thing you either
/// want full width or not at all.
struct MarketsView: View {
    @EnvironmentObject private var sky: SkyModel

    enum Tab: Hashable { case news, sport, markets }
    @State private var tab: Tab = .news
    @State private var newsScope: NewsScope = .top
    @State private var sport: SportScope = .football
    @State private var channel = 0

    enum NewsScope: Hashable { case top, local }
    enum SportScope: Hashable { case football, f1 }

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    ViewTitle(eyebrow: "Live", title: "Markets & News", accent: sky.phase.accent)
                    Spacer()
                    // The weather strip the web keeps in this view's hero, so
                    // you keep that context while reading.
                    HStack(spacing: 7) {
                        Image(systemName: WeatherIcon.symbol(Sample.currentIcon))
                            .font(.system(size: 13, weight: .light))
                            .foregroundStyle(Theme.moon.opacity(0.7))
                        Text("\(Sample.currentTemp)°")
                            .font(PulseFont.figures(15))
                            .foregroundStyle(Theme.moon.opacity(0.9))
                    }
                    .padding(.top, 14)
                }

                Tape()
            }
        } ground: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    LiveChannel(channel: $channel, accent: sky.phase.accent)

                    SegTabs(
                        items: [(.news, "News"), (.sport, "Sport"), (.markets, "Markets")],
                        selection: $tab,
                        accent: sky.phase.accent
                    )

                    switch tab {
                    case .news: newsList
                    case .sport: sportPanel
                    case .markets: watchlist
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: News

    private var newsList: some View {
        VStack(alignment: .leading, spacing: 14) {
            SegTabs(
                items: [(NewsScope.top, "Top"), (NewsScope.local, "Local")],
                selection: $newsScope,
                accent: sky.phase.accent
            )
            VStack(spacing: 0) {
                let items = newsScope == .top ? Sample.topNews : Sample.localNews
                ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(PulseFont.title)
                            .foregroundStyle(Theme.moon.opacity(0.94))
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(item.source)  ·  \(item.ago)")
                            .font(PulseFont.meta)
                            .foregroundStyle(Theme.dim)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 11)
                    if i < items.count - 1 { Hairline() }
                }
            }
        }
    }

    // MARK: Sport

    private var sportPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            SegTabs(
                items: [(SportScope.football, "Arsenal"), (SportScope.f1, "Formula 1")],
                selection: $sport,
                accent: sky.phase.accent
            )

            // The next fixture is what the web puts above the table, and it is
            // the thing you actually came for.
            Pane {
                VStack(alignment: .leading, spacing: 6) {
                    Text(sport == .football ? Sample.nextFixture.competition : "Next race")
                        .font(PulseFont.label)
                        .foregroundStyle(Theme.moon.opacity(0.7))
                    Text(sport == .football
                         ? "\(Sample.nextFixture.home) vs \(Sample.nextFixture.away)"
                         : Sample.nextRace.name)
                        .font(PulseFont.titleLarge)
                        .foregroundStyle(Theme.moon)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        chip(sport == .football ? Sample.nextFixture.when : Sample.nextRace.when,
                             "calendar")
                        chip(sport == .football ? Sample.nextFixture.time : Sample.nextRace.time,
                             "clock")
                    }
                }
            }

            VStack(spacing: 0) {
                let rows = sport == .football ? Sample.premierLeague : Sample.f1Drivers
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                    HStack(spacing: 12) {
                        Text("\(row.position)")
                            .font(PulseFont.figures(13))
                            .foregroundStyle(Theme.dim)
                            .frame(width: 20, alignment: .trailing)
                        Text(row.name)
                            .font(PulseFont.title)
                            .foregroundStyle(Theme.moon.opacity(row.highlighted ? 1 : 0.88))
                            .lineLimit(1)
                        Spacer()
                        if sport == .football {
                            Text("\(row.played)")
                                .font(PulseFont.figures(13))
                                .foregroundStyle(Theme.dim)
                                .frame(width: 22, alignment: .trailing)
                            Text(row.diff > 0 ? "+\(row.diff)" : "\(row.diff)")
                                .font(PulseFont.figures(13))
                                .foregroundStyle(Theme.dim)
                                .frame(width: 28, alignment: .trailing)
                        }
                        Text("\(row.points)")
                            .font(PulseFont.figures(15))
                            .foregroundStyle(Theme.moon)
                            .frame(width: 34, alignment: .trailing)
                    }
                    .padding(.vertical, 9)
                    .padding(.horizontal, row.highlighted ? 8 : 0)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(row.highlighted ? sky.phase.accent.opacity(0.1) : .clear)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(row.highlighted ? sky.phase.accent.opacity(0.4) : .clear, lineWidth: 1)
                    )
                    if i < rows.count - 1 { Hairline() }
                }
            }
        }
    }

    private func chip(_ text: String, _ symbol: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 10))
            Text(text).font(PulseFont.micro)
        }
        .foregroundStyle(Theme.moon.opacity(0.75))
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.white.opacity(0.07)))
    }

    // MARK: Markets

    private var watchlist: some View {
        VStack(alignment: .leading, spacing: 12) {
            let up = Sample.watchlist.filter { $0.change >= 0 }.count
            Pane(padding: 13) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Watchlist")
                            .font(PulseFont.label)
                            .foregroundStyle(Theme.moon.opacity(0.72))
                        Text("\(Sample.watchlist.count) instruments")
                            .font(PulseFont.titleLarge)
                            .foregroundStyle(Theme.moon)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(up) up").font(PulseFont.meta).foregroundStyle(Color.rise)
                        Text("\(Sample.watchlist.count - up) down").font(PulseFont.meta).foregroundStyle(Color.fall)
                    }
                }
            }

            VStack(spacing: 0) {
                ForEach(Array(Sample.watchlist.enumerated()), id: \.element.id) { i, item in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.symbol)
                                .font(PulseFont.figures(15))
                                .foregroundStyle(Theme.moon)
                            Text(item.name)
                                .font(PulseFont.meta)
                                .foregroundStyle(Theme.dim)
                                .lineLimit(1)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(item.crypto
                                 ? "$\(Int(item.price).formatted())"
                                 : item.price.formatted(.number.precision(.fractionLength(2))))
                                .font(PulseFont.figures(15))
                                .foregroundStyle(Theme.moon)
                            HStack(spacing: 3) {
                                Image(systemName: item.change >= 0 ? "arrow.up" : "arrow.down")
                                    .font(.system(size: 9, weight: .bold))
                                Text("\(abs(item.change).formatted(.number.precision(.fractionLength(2))))%")
                                    .font(PulseFont.figures(12))
                            }
                            .foregroundStyle(item.change >= 0 ? Color.rise : Color.fall)
                        }
                    }
                    .padding(.vertical, 10)
                    if i < Sample.watchlist.count - 1 { Hairline() }
                }
            }
        }
    }
}

/// The price tape. The web scrolls it continuously between sky and ground; here
/// it sits under the title doing the same job.
private struct Tape: View {
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                ForEach(Sample.watchlist) { item in
                    HStack(spacing: 6) {
                        Text(item.symbol)
                            .font(PulseFont.figures(12))
                            .foregroundStyle(Theme.moon.opacity(0.9))
                        Text(item.crypto
                             ? "$\(Int(item.price).formatted())"
                             : item.price.formatted(.number.precision(.fractionLength(2))))
                            .font(PulseFont.figures(12))
                            .foregroundStyle(Theme.moon.opacity(0.6))
                        Text("\(item.change >= 0 ? "+" : "")\(item.change.formatted(.number.precision(.fractionLength(1))))%")
                            .font(PulseFont.figures(12))
                            .foregroundStyle(item.change >= 0 ? Color.rise : Color.fall)
                    }
                }
            }
        }
        .scrollClipDisabled()
        .mask(
            LinearGradient(
                stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.04),
                        .init(color: .black, location: 0.9), .init(color: .clear, location: 1)],
                startPoint: .leading, endPoint: .trailing
            )
        )
    }
}

private struct LiveChannel: View {
    @Binding var channel: Int
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ColumnHead(label: "Live channel", accent: accent)

            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: 0x1e293b), Color(hex: 0x0f172a)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                VStack(spacing: 8) {
                    Image(systemName: "play.circle")
                        .font(.system(size: 34, weight: .ultraLight))
                        .foregroundStyle(Theme.moon.opacity(0.75))
                    Text(Sample.channels[channel])
                        .font(PulseFont.title)
                        .foregroundStyle(Theme.moon.opacity(0.9))
                }
            }
            .frame(height: 176)
            .overlay(alignment: .topLeading) {
                HStack(spacing: 5) {
                    Circle().fill(Color.fall).frame(width: 6, height: 6)
                    Text("Live").font(PulseFont.micro).foregroundStyle(Theme.moon.opacity(0.85))
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(Capsule().fill(.black.opacity(0.45)))
                .padding(10)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(Sample.channels.enumerated()), id: \.offset) { i, name in
                        Button { channel = i } label: {
                            Text(name)
                                .font(PulseFont.micro)
                                .foregroundStyle(i == channel ? Theme.ink : Theme.moon.opacity(0.7))
                                .padding(.horizontal, 11)
                                .padding(.vertical, 6)
                                .background(Capsule().fill(i == channel ? Theme.moon : Color.white.opacity(0.06)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollClipDisabled()
        }
    }
}
