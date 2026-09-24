import SwiftUI

/// Music.
///
/// The web keeps the now-playing hero across the top and puts playlists and
/// recently-played in the ground columns. The hero stays — it is the reason the
/// view exists — and the columns become tabs. The sleeve lends the screen its
/// colour here exactly as it does on the web.
struct MusicView: View {
    @EnvironmentObject private var sky: SkyModel

    enum Tab: Hashable { case playlists, recent, lyrics }
    @State private var tab: Tab = .playlists
    @State private var playing = true
    @State private var position = Sample.playedSeconds
    @State private var immersive = false

    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 14) {
                    Sleeve(tint: Sample.nowPlaying.art, size: 78)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(playing ? "Now playing" : "Paused")
                            .font(PulseFont.eyebrow)
                            .foregroundStyle(sky.phase.accent.opacity(0.85))
                        Text(Sample.nowPlaying.title)
                            .font(PulseFont.hero(25))
                            .foregroundStyle(Theme.moon)
                            .lineLimit(2)
                        Text(Sample.nowPlaying.artist)
                            .font(PulseFont.meta)
                            .foregroundStyle(Theme.dim)
                    }
                    Spacer(minLength: 0)
                }

                VStack(spacing: 5) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.white.opacity(0.12))
                            Capsule()
                                .fill(Sample.nowPlaying.art)
                                .frame(width: geo.size.width * (position / Sample.totalSeconds))
                        }
                    }
                    .frame(height: 3)

                    HStack {
                        Text(Self.clock(position))
                        Spacer()
                        Text(Sample.nowPlaying.duration)
                    }
                    .font(PulseFont.figures(11))
                    .foregroundStyle(Theme.dim)
                }

                HStack(spacing: 14) {
                    IconPill(system: "backward.fill", size: 40)
                    IconPill(system: playing ? "pause.fill" : "play.fill", size: 52, lit: true) {
                        playing.toggle()
                    }
                    IconPill(system: "forward.fill", size: 40)
                    Spacer()
                    IconPill(system: "hifispeaker", size: 38)
                    IconPill(system: "arrow.up.left.and.arrow.down.right", size: 38) {
                        immersive = true
                    }
                }
            }
        } ground: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SegTabs(
                        items: [(.playlists, "Playlists"), (.recent, "Recent"), (.lyrics, "Lyrics")],
                        selection: $tab,
                        accent: sky.phase.accent
                    )

                    switch tab {
                    case .playlists: playlistGrid
                    case .recent: recentList
                    case .lyrics: lyricStack
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
        }
        .onReceive(tick) { _ in
            guard playing else { return }
            position = min(position + 1, Sample.totalSeconds)
        }
        .fullScreenCover(isPresented: $immersive) {
            ImmersiveView(position: $position, playing: $playing)
        }
    }

    private var playlistGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
            ForEach(Sample.playlists) { list in
                VStack(alignment: .leading, spacing: 7) {
                    Sleeve(tint: list.tint, size: nil)
                    Text(list.name)
                        .font(PulseFont.title)
                        .foregroundStyle(Theme.moon.opacity(0.92))
                        .lineLimit(1)
                    Text("\(list.count) tracks")
                        .font(PulseFont.micro)
                        .foregroundStyle(Theme.dim)
                }
            }
        }
    }

    private var recentList: some View {
        VStack(spacing: 0) {
            ForEach(Array(Sample.recent.enumerated()), id: \.element.id) { i, track in
                HStack(spacing: 12) {
                    Sleeve(tint: track.art, size: 42)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title)
                            .font(PulseFont.title)
                            .foregroundStyle(Theme.moon.opacity(0.94))
                            .lineLimit(1)
                        Text(track.artist)
                            .font(PulseFont.meta)
                            .foregroundStyle(Theme.dim)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(track.duration)
                        .font(PulseFont.figures(12))
                        .foregroundStyle(Theme.dim)
                }
                .padding(.vertical, 8)
                if i < Sample.recent.count - 1 { Hairline() }
            }
        }
    }

    private var lyricStack: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(Sample.lyrics.enumerated()), id: \.offset) { _, line in
                let active = abs(line.at - position) < 4
                Text(line.line)
                    .font(.custom("Newsreader16pt-Regular", size: active ? 25 : 21))
                    .foregroundStyle(Theme.moon.opacity(active ? 1 : 0.32))
                    .fontWeight(active ? .semibold : .regular)
                    .animation(.easeOut(duration: 0.35), value: active)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .leading) {
                        if active {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Sample.nowPlaying.art)
                                .frame(width: 3, height: 22)
                                .offset(x: -13)
                        }
                    }
            }
        }
        .padding(.leading, 13)
    }

    static func clock(_ seconds: Double) -> String {
        let s = Int(seconds)
        return "\(s / 60):\(String(format: "%02d", s % 60))"
    }
}

/// A sleeve. Real artwork arrives with the backend; for now the palette stands
/// in for it, which is enough to judge the layout.
struct Sleeve: View {
    let tint: Color
    var size: CGFloat?

    var body: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [tint, tint.opacity(0.55)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .aspectRatio(1, contentMode: .fit)
            .frame(width: size, height: size)
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(Color.white.opacity(0.12), lineWidth: 1)
            )
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: (size ?? 90) * 0.24, weight: .light))
                    .foregroundStyle(.white.opacity(0.5))
            )
    }
}

/// The immersive player: the words, a horizon carrying the track, the record and
/// the transport beneath it. The phone's version of the full-screen view.
private struct ImmersiveView: View {
    @Binding var position: Double
    @Binding var playing: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color(hex: 0x04060d).ignoresSafeArea()
            RadialGradient(
                colors: [Sample.nowPlaying.art.opacity(0.55), .clear],
                center: .init(x: 0.75, y: 0.28), startRadius: 0, endRadius: 420
            )
            .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    IconPill(system: "arrow.down.right.and.arrow.up.left", size: 36) { dismiss() }
                }
                .padding(.horizontal, 20)

                Spacer()

                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(Sample.lyrics.enumerated()), id: \.offset) { _, line in
                        let active = abs(line.at - position) < 4
                        Text(line.line)
                            .font(.custom("Newsreader16pt-Regular", size: active ? 27 : 22))
                            .foregroundStyle(Theme.moon.opacity(active ? 1 : 0.22))
                            .fontWeight(active ? .semibold : .regular)
                            .overlay(alignment: .leading) {
                                if active {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Sample.nowPlaying.art)
                                        .frame(width: 3, height: 24)
                                        .offset(x: -13)
                                }
                            }
                    }
                }
                .padding(.leading, 33)
                .padding(.trailing, 20)

                Spacer()

                // The horizon: the track, lit as far as it has been heard.
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(Theme.rule).frame(height: 1)
                        Rectangle()
                            .fill(Sample.nowPlaying.art)
                            .frame(width: geo.size.width * (position / Sample.totalSeconds), height: 1)
                            .shadow(color: Sample.nowPlaying.art.opacity(0.7), radius: 6)
                    }
                    .frame(height: geo.size.height, alignment: .center)
                }
                .frame(height: 12)

                HStack(spacing: 14) {
                    Sleeve(tint: Sample.nowPlaying.art, size: 54)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Sample.nowPlaying.title)
                            .font(PulseFont.titleLarge)
                            .foregroundStyle(Theme.moon)
                            .lineLimit(1)
                        Text(Sample.nowPlaying.artist)
                            .font(PulseFont.meta)
                            .foregroundStyle(Theme.dim)
                    }
                    Spacer()
                    IconPill(system: playing ? "pause.fill" : "play.fill", size: 46, lit: true) {
                        playing.toggle()
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .preferredColorScheme(.dark)
    }
}
