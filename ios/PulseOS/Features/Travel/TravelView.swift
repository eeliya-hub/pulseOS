import SwiftUI

/// Travel.
///
/// The densest view in the web app: trip facts and a live flight card in the
/// hero, then map, itinerary and details across three ground columns, with the
/// itinerary already tabbed by day. The hero keeps the countdown and the flight,
/// because those are the two things the web makes largest; everything else goes
/// behind tabs, and the itinerary keeps its day tabs nested inside.
struct TravelView: View {
    @EnvironmentObject private var sky: SkyModel

    enum Tab: Hashable { case itinerary, flight, place, packing }
    @State private var tab: Tab = .itinerary
    @State private var day = 0
    @State private var packing = Sample.packing

    var body: some View {
        Stage(phase: sky.phase) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 7) {
                    Text(Sample.trip.flag)
                    Text(Sample.trip.place)
                        .font(PulseFont.eyebrow)
                        .foregroundStyle(sky.phase.accent.opacity(0.85))
                    Text(Sample.trip.dates)
                        .font(PulseFont.micro)
                        .foregroundStyle(Theme.dim)
                }

                Text(Sample.trip.name)
                    .font(PulseFont.hero(34))
                    .foregroundStyle(Theme.moon)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                // The three facts the web sets largest: local time, weather
                // there, and how long you are staying.
                HStack(spacing: 0) {
                    Stat(value: Sample.trip.localTime, label: "Local, +8h", emphasis: true)
                    Stat(value: "\(Sample.trip.temp)°", label: Sample.trip.condition, emphasis: true)
                    Stat(value: "\(Sample.trip.nights)", label: "nights", emphasis: true)
                }
            }
        } ground: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SegTabs(
                        items: [(.itinerary, "Itinerary"), (.flight, "Flight"),
                                (.place, "Place"), (.packing, "Packing")],
                        selection: $tab,
                        accent: sky.phase.accent
                    )

                    switch tab {
                    case .itinerary: itinerary
                    case .flight: flightCard
                    case .place: placePanel
                    case .packing: packingList
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var itinerary: some View {
        VStack(alignment: .leading, spacing: 14) {
            SegTabs(
                items: Sample.tripDays.enumerated().map { ($0.offset, $0.element.label) },
                selection: $day,
                accent: sky.phase.accent
            )

            let plans = Sample.tripDays[min(day, Sample.tripDays.count - 1)].plans
            VStack(spacing: 0) {
                ForEach(Array(plans.enumerated()), id: \.element.id) { i, plan in
                    HStack(spacing: 12) {
                        Image(systemName: plan.done ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 17, weight: .light))
                            .foregroundStyle(plan.done ? sky.phase.accent : Theme.moon.opacity(0.32))
                        Text(plan.time)
                            .font(PulseFont.figures(13))
                            .foregroundStyle(Theme.moon.opacity(0.72))
                            .frame(width: 42, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(plan.title)
                                .font(PulseFont.title)
                                .foregroundStyle(Theme.moon.opacity(plan.done ? 0.5 : 0.94))
                            if let place = plan.place {
                                Text(place)
                                    .font(PulseFont.meta)
                                    .foregroundStyle(Theme.dim)
                            }
                        }
                        Spacer()
                    }
                    .padding(.vertical, 10)
                    if i < plans.count - 1 { Hairline() }
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "plus").font(.system(size: 13, weight: .medium))
                Text("Add a plan").font(PulseFont.body)
                Spacer()
            }
            .foregroundStyle(Theme.moon.opacity(0.45))
        }
    }

    private var flightCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Pane {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        Text(Sample.flight.number)
                            .font(PulseFont.titleLarge)
                            .foregroundStyle(Theme.moon)
                        Text(Sample.flight.airline)
                            .font(PulseFont.meta)
                            .foregroundStyle(Theme.dim)
                        Spacer()
                        Text(Sample.flight.date)
                            .font(PulseFont.micro)
                            .foregroundStyle(Theme.dim)
                    }

                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Sample.flight.from)
                                .font(PulseFont.hero(28))
                                .foregroundStyle(Theme.moon)
                            Text(Sample.flight.fromCity)
                                .font(PulseFont.meta).foregroundStyle(Theme.dim)
                            Text(Sample.flight.depart)
                                .font(PulseFont.figures(14))
                                .foregroundStyle(Theme.moon.opacity(0.8))
                        }
                        Spacer()
                        VStack(spacing: 3) {
                            Image(systemName: "airplane")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.moon.opacity(0.6))
                            Rectangle()
                                .fill(Theme.rule)
                                .frame(width: 70, height: 1)
                        }
                        .padding(.top, 12)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Sample.flight.to)
                                .font(PulseFont.hero(28))
                                .foregroundStyle(Theme.moon)
                            Text(Sample.flight.toCity)
                                .font(PulseFont.meta).foregroundStyle(Theme.dim)
                            HStack(spacing: 3) {
                                Text(Sample.flight.arrive)
                                    .font(PulseFont.figures(14))
                                    .foregroundStyle(Theme.moon.opacity(0.8))
                                Text(Sample.flight.plus)
                                    .font(PulseFont.micro)
                                    .foregroundStyle(sky.phase.accent)
                            }
                        }
                    }

                    Hairline()

                    HStack(spacing: 0) {
                        Stat(value: Sample.flight.distance, label: "Distance")
                        Stat(value: Sample.flight.duration, label: "In the air")
                    }
                }
            }
        }
    }

    private var placePanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            // A real MapLibre map lands with the backend; this is the frame it
            // goes in.
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        LinearGradient(colors: [Color(hex: 0x14243f), Color(hex: 0x0b1524)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                VStack(spacing: 7) {
                    Image(systemName: "map")
                        .font(.system(size: 26, weight: .ultraLight))
                        .foregroundStyle(Theme.moon.opacity(0.55))
                    Text("Where you're going")
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                }
            }
            .frame(height: 168)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.07), lineWidth: 1)
            )

            VStack(spacing: 0) {
                ForEach(Array(Sample.places.enumerated()), id: \.offset) { i, place in
                    HStack(spacing: 12) {
                        Image(systemName: place.kind == "Stay" ? "bed.double" :
                                place.kind == "Airport" ? "airplane" : "mappin")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.moon.opacity(0.6))
                            .frame(width: 20)
                        Text(place.name)
                            .font(PulseFont.title)
                            .foregroundStyle(Theme.moon.opacity(0.92))
                        Spacer()
                        Text(place.kind)
                            .font(PulseFont.micro)
                            .foregroundStyle(Theme.dim)
                    }
                    .padding(.vertical, 10)
                    if i < Sample.places.count - 1 { Hairline() }
                }
            }

            Pane(padding: 13) {
                VStack(alignment: .leading, spacing: 10) {
                    ColumnHead(label: "Good to know", accent: sky.phase.accent)
                    HStack(spacing: 0) {
                        Stat(value: "Type A/B", label: "Plug")
                        Stat(value: Sample.trip.drives, label: "Drives")
                    }
                    HStack(spacing: 0) {
                        Stat(value: Sample.trip.dial, label: "Dial code")
                        Stat(value: Sample.trip.emergency, label: "Emergency")
                    }
                    Text(Sample.trip.rate)
                        .font(PulseFont.meta)
                        .foregroundStyle(Theme.dim)
                }
            }
        }
    }

    private var packingList: some View {
        VStack(spacing: 0) {
            let done = packing.filter(\.done).count
            HStack {
                Text("\(done) of \(packing.count) packed")
                    .font(PulseFont.label)
                    .foregroundStyle(Theme.moon.opacity(0.72))
                Spacer()
            }
            .padding(.bottom, 10)

            ForEach($packing) { $item in
                Button {
                    withAnimation(.snappy(duration: 0.2)) { item.done.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 19, weight: .light))
                            .foregroundStyle(item.done ? sky.phase.accent : Theme.moon.opacity(0.32))
                        Text(item.title)
                            .font(PulseFont.title)
                            .foregroundStyle(Theme.moon.opacity(item.done ? 0.42 : 0.94))
                            .strikethrough(item.done, color: Theme.moon.opacity(0.4))
                        Spacer()
                    }
                    .padding(.vertical, 11)
                }
                .buttonStyle(.plain)
                Hairline()
            }
        }
    }
}
