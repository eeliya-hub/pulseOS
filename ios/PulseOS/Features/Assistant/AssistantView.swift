import SwiftUI

/// Ask Pulse.
///
/// The assistant is the point of the whole app, so it gets the least chrome: a
/// conversation, the suggestions the web offers under it, and one field. Past
/// conversations sit behind a sheet rather than a sidebar, which is the web's
/// left column with nowhere to go on a phone.
///
/// Answers here are canned. The agent loop, its forty tools and the voice
/// session are the next slice; this is the room they arrive into.
struct AssistantView: View {
    @EnvironmentObject private var sky: SkyModel

    @State private var messages = Sample.conversation
    @State private var draft = ""
    @State private var showHistory = false
    @State private var thinking = false
    @FocusState private var writing: Bool

    var body: some View {
        Stage(phase: sky.phase) {
            HStack(alignment: .top) {
                ViewTitle(eyebrow: "Real-time with Gemini", title: "Ask Pulse", accent: sky.phase.accent)
                Spacer()
                HStack(spacing: 8) {
                    IconPill(system: "clock.arrow.circlepath", size: 36) { showHistory = true }
                    IconPill(system: "square.and.pencil", size: 36) {
                        messages = []
                    }
                }
                .padding(.top, 10)
            }
        } ground: {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            if messages.isEmpty {
                                Text("Ask about your day, your calendar, the markets — or tell Pulse to change something.")
                                    .font(PulseFont.body)
                                    .foregroundStyle(Theme.dim)
                                    .padding(.top, 10)
                            }
                            ForEach(messages) { message in
                                Bubble(message: message, accent: sky.phase.accent)
                                    .id(message.id)
                            }
                            if thinking {
                                Working(accent: sky.phase.accent)
                            }
                        }
                        .padding(.horizontal, 22)
                        .padding(.top, 18)
                        .padding(.bottom, 12)
                    }
                    .scrollIndicators(.hidden)
                    .onChange(of: messages.count) {
                        withAnimation { proxy.scrollTo(messages.last?.id, anchor: .bottom) }
                    }
                }

                suggestions
                composer
            }
        }
        .sheet(isPresented: $showHistory) { history }
    }

    private var suggestions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(Sample.suggestions, id: \.self) { text in
                    Button { send(text) } label: {
                        Text(text)
                            .font(PulseFont.micro)
                            .foregroundStyle(Theme.moon.opacity(0.78))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color.white.opacity(0.07)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
        }
        .scrollClipDisabled()
        .padding(.bottom, 10)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            Image(systemName: "mic")
                .font(.system(size: 15))
                .foregroundStyle(Theme.moon.opacity(0.6))
                .frame(width: 34, height: 34)
                .background(Circle().fill(Color.white.opacity(0.07)))

            TextField("Message Pulse", text: $draft, axis: .vertical)
                .font(PulseFont.body)
                .foregroundStyle(Theme.moon)
                .tint(sky.phase.accent)
                .lineLimit(1...4)
                .focused($writing)
                .onSubmit { send(draft) }

            Button { send(draft) } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(draft.isEmpty ? Theme.moon.opacity(0.4) : Theme.ink)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(draft.isEmpty ? Color.white.opacity(0.08) : Theme.moon))
            }
            .buttonStyle(.plain)
            .disabled(draft.isEmpty)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(
            Capsule().fill(Color.white.opacity(0.06))
        )
        .overlay(Capsule().stroke(Color.white.opacity(0.09), lineWidth: 1))
        .padding(.horizontal, 18)
        .padding(.bottom, 12)
    }

    private var history: some View {
        NavigationStack {
            List {
                ForEach(Sample.conversations, id: \.self) { title in
                    Text(title)
                        .font(PulseFont.body)
                        .foregroundStyle(Theme.moon.opacity(0.9))
                        .listRowBackground(Color.white.opacity(0.04))
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ink)
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
        .preferredColorScheme(.dark)
    }

    private func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        messages.append(Sample.Message(fromPulse: false, text: trimmed))
        draft = ""
        writing = false
        thinking = true

        // Stands in for the agent loop until it is wired.
        Task {
            try? await Task.sleep(for: .seconds(1.1))
            thinking = false
            messages.append(Sample.Message(
                fromPulse: true,
                text: "That one needs the backend. Once the agent loop is wired this answers from your live calendar, weather, markets and music — and can change them."
            ))
        }
    }
}

private struct Bubble: View {
    let message: Sample.Message
    let accent: Color

    var body: some View {
        if message.fromPulse {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.system(size: 12))
                    .foregroundStyle(accent)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(accent.opacity(0.14)))
                Text(attributed)
                    .font(PulseFont.body)
                    .foregroundStyle(Theme.moon.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            HStack {
                Spacer(minLength: 40)
                Text(message.text)
                    .font(PulseFont.body)
                    .foregroundStyle(Theme.moon)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color.white.opacity(0.08))
                    )
            }
        }
    }

    /// The assistant answers in light markdown on the web; keep the bold.
    private var attributed: AttributedString {
        (try? AttributedString(
            markdown: message.text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(message.text)
    }
}

private struct Working: View {
    let accent: Color
    @State private var phase = 0.0

    var body: some View {
        HStack(spacing: 7) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(accent.opacity(0.8))
                    .frame(width: 5, height: 5)
                    .scaleEffect(1 + 0.45 * sin(phase + Double(i) * 0.9))
            }
            Text("Pulling that together")
                .font(PulseFont.meta)
                .foregroundStyle(Theme.dim)
        }
        .onAppear {
            withAnimation(.linear(duration: 1.1).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
        }
    }
}
