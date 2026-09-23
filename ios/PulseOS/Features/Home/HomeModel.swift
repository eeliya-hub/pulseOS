import Foundation

/// Who the dashboard belongs to and where it is.
///
/// The web app keeps this in localStorage behind `useSettings`; there is no
/// backend route for it, so the phone needs its own copy. Hard defaults for now
/// — a settings screen is its own slice.
struct Settings {
    var name: String
    var city: String

    static var current: Settings {
        let defaults = UserDefaults.standard
        return Settings(
            name: defaults.string(forKey: "pulse.name") ?? "Eeliya",
            city: defaults.string(forKey: "pulse.city") ?? "Ghent"
        )
    }
}

@MainActor
final class HomeModel: ObservableObject {
    @Published private(set) var weather: Weather?
    @Published private(set) var forecast: [Forecast.Point] = []
    @Published private(set) var events: [Event] = []
    @Published private(set) var isLoading = false
    /// Non-fatal: a dead integration should show as a quiet line, not a blank
    /// screen, exactly as it does on the web.
    @Published private(set) var problems: [String] = []

    let settings = Settings.current

    /// Everything on the screen today, in the order it will be read.
    var today: [Event] {
        let calendar = Calendar.current
        return events.filter { calendar.isDateInToday($0.start) }
    }

    /// The next thing that has not finished yet.
    var next: Event? {
        let now = Date.now
        return events.first { ($0.end ?? $0.start) > now }
    }

    /// Everything after the one being highlighted.
    var upcoming: [Event] {
        guard let next else { return events }
        return events.filter { $0.start > next.start }
    }

    var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<12: return "Good morning,"
        case 12..<18: return "Good afternoon,"
        default: return "Good evening,"
        }
    }

    var todayLine: String {
        let count = today.count
        switch count {
        case 0: return "Nothing on today"
        case 1: return "1 thing on today"
        default: return "\(count) things on today"
        }
    }

    func load() async {
        isLoading = true
        problems = []
        defer { isLoading = false }

        // Each integration is allowed to fail on its own; one dead key should
        // not take the screen with it.
        async let weatherTask: Weather? = try? Backend.get("weather", query: ["city": settings.city])
        async let forecastTask: Forecast? = try? Backend.get(
            "weather/forecast", query: ["city": settings.city]
        )
        async let eventsTask: CalendarFeed? = try? Backend.get(
            "calendar/events", query: ["days": "7"]
        )

        let (w, f, e) = await (weatherTask, forecastTask, eventsTask)

        weather = w
        if w == nil { problems.append("Weather unavailable") }

        // One point a day is enough for a phone: the web shows six columns, the
        // phone shows the next few days as rows.
        forecast = Self.daily(from: f?.points ?? [])
        events = (e?.events ?? []).sorted { $0.start < $1.start }
        if e == nil { problems.append("Calendar unavailable") }
    }

    /// The three-hourly feed reduced to one reading per day — the warmest point,
    /// which is what a forecast row is understood to mean.
    private static func daily(from points: [Forecast.Point]) -> [Forecast.Point] {
        let calendar = Calendar.current
        var byDay: [Date: Forecast.Point] = [:]
        for point in points {
            let day = calendar.startOfDay(for: point.date)
            if let existing = byDay[day], existing.temp >= point.temp { continue }
            byDay[day] = point
        }
        return byDay.keys.sorted().compactMap { byDay[$0] }
    }
}
