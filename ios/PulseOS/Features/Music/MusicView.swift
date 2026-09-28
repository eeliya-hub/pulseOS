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
    /// Nil shows the grid; set shows that playlist's tracks in the same panel.
    @State private var openPlaylist: Sample.Playlist?
    /// What is playing, once you pick something. Until then the hero shows the
    /// sample now-playing track.
    @State private var current: Sample.Track?
    @State private var fromPlaylist: String?

    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 14) {
                    Sleeve(tint: track.art, size: 78)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(heroEyebrow)
                            .font(PulseFont.eyebrow)
                            .foregroundStyle(sky.phase.accent.opacity(0.85))
                            .lineLimit(1)
                        Text(track.title)
                            .font(PulseFont.hero(25))
                            .foregroundStyle(Theme.moon)
                            .lineLimit(2)
                        Text(track.artist)
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
                                .fill(track.art)
                                .frame(width: geo.size.width * (position / Sample.totalSeconds))
                        }
                    }
                    .frame(height: 3)

                    HStack {
                        Text(Self.clock(position))
                        Spacer()
                        Text(track.duration)
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
                    case .playlists:
                        // Opening one replaces the grid in place rather than
                        // pushing a screen: the player above stays put, so you
                        // can pick a track without losing what is playing.
                        if let open = openPlaylist {
                            PlaylistDetail(
                                playlist: open,
                                accent: sky.phase.accent,
                                nowPlaying: nowPlayingTitle,
                                onBack: { withAnimation(.snappy(duration: 0.24)) { openPlaylist = nil } },
                                onPlay: { play($0, from: open) }
                            )
                        } else {
                            playlistGrid
                        }
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
                Button {
                    withAnimation(.snappy(duration: 0.24)) { openPlaylist = list }
                } label: {
                    VStack(alignment: .leading, spacing: 7) {
                        Sleeve(tint: list.tint, size: nil)
                            .overlay(alignment: .bottomTrailing) {
                                // Play the whole list without opening it.
                                Button {
                                    if let first = list.tracks.first { play(first, from: list) }
                                } label: {
                                    Image(systemName: "play.fill")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(Theme.ink)
                                        .frame(width: 30, height: 30)
                                        .background(Circle().fill(Theme.moon))
                                        .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
                                }
                                .buttonStyle(.plain)
                                .padding(8)
                            }
                        Text(list.name)
                            .font(PulseFont.title)
                            .foregroundStyle(Theme.moon.opacity(0.92))
                            .lineLimit(1)
                        Text("\(list.count) tracks")
                            .font(PulseFont.micro)
                            .foregroundStyle(Theme.dim)
                    }
                }
                .buttonStyle(.plain)
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
                                .fill(track.art)
                                .frame(width: 3, height: 22)
                                .offset(x: -13)
                        }
                    }
            }
        }
        .padding(.leading, 13)
    }

    /// What the hero shows: whatever was picked, else the sample track.
    private var track: Sample.Track { current ?? Sample.nowPlaying }

    private var nowPlayingTitle: String? { track.title }

    private var heroEyebrow: String {
        guard playing else { return "Paused" }
        if let fromPlaylist { return "Playing from \(fromPlaylist)" }
        return "Now playing"
    }

    private func play(_ track: Sample.Track, from list: Sample.Playlist) {
        withAnimation(.snappy(duration: 0.24)) {
            current = track
            fromPlaylist = list.name
            position = 0
            playing = true
        }
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

/// A playlist, opened in place of the grid.
///
/// Same panel, same position on the screen as Recent — the player above does not
/// move, so picking a track out of a list never costs you sight of what is
/// currently on. Back returns to the grid rather than to a previous screen.
private struct PlaylistDetail: View {
    let playlist: Sample.Playlist
    let accent: Color
    let nowPlaying: String?
    let onBack: () -> Void
    let onPlay: (Sample.Track) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.moon.opacity(0.8))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.07)))
                }
                .buttonStyle(.plain)

                Sleeve(tint: playlist.tint, size: 46)

                VStack(alignment: .leading, spacing: 2) {
                    Text(playlist.name)
                        .font(PulseFont.titleLarge)
                        .foregroundStyle(Theme.moon)
                        .lineLimit(1)
                    Text("\(playlist.count) tracks")
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                }

                Spacer()

                Button {
                    if let first = playlist.tracks.first { onPlay(first) }
                } label: {
                    Image(systemName: "play.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Theme.moon))
                }
                .buttonStyle(.plain)
            }

            VStack(spacing: 0) {
                ForEach(Array(playlist.tracks.enumerated()), id: \.element.id) { i, item in
                    let on = item.title == nowPlaying
                    Button { onPlay(item) } label: {
                        HStack(spacing: 12) {
                            // The track number gives way to a marker on the one
                            // that is playing, so the row reads without colour
                            // alone carrying it.
                            Group {
                                if on {
                                    Image(systemName: "speaker.wave.2.fill")
                                        .font(.system(size: 11))
                                        .foregroundStyle(accent)
                                } else {
                                    Text("\(i + 1)")
                                        .font(PulseFont.figures(12))
                                        .foregroundStyle(Theme.dim)
                                }
                            }
                            .frame(width: 18)

                            Sleeve(tint: item.art, size: 38)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(PulseFont.title)
                                    .foregroundStyle(on ? accent : Theme.moon.opacity(0.94))
                                    .lineLimit(1)
                                Text(item.artist)
                                    .font(PulseFont.meta)
                                    .foregroundStyle(Theme.dim)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Text(item.duration)
                                .font(PulseFont.figures(12))
                                .foregroundStyle(Theme.dim)
                        }
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    if i < playlist.tracks.count - 1 { Hairline() }
                }
            }

            if playlist.tracks.count < playlist.count {
                Text("Showing \(playlist.tracks.count) of \(playlist.count) — the rest arrive with the backend.")
                    .font(PulseFont.micro)
                    .foregroundStyle(Theme.dim)
                    .padding(.top, 2)
            }
        }
    }
}
