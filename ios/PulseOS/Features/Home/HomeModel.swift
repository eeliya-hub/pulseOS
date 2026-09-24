import Foundation

/// Who the dashboard belongs to and where it is.
///
/// The web keeps this in localStorage behind `useSettings`; there is no backend
/// route for it, so the phone needs its own copy.
struct Settings {
    var name: String
    var city: String

    static var current: Settings {
        let defaults = UserDefaults.standard
        return Settings(
            name: defaults.string(forKey: "pulse.name") ?? Sample.name,
            city: defaults.string(forKey: "pulse.city") ?? Sample.city
        )
    }
}

/// The seam between the views and where their data comes from.
///
/// Everything here reads `Sample` for now, deliberately: the UI is being designed
/// first and wired second. Swapping a section over means changing this file to
/// call `Backend`, not touching the view — the shapes already match the real
/// payloads.
@MainActor
final class HomeModel: ObservableObject {
    let settings = Settings.current

    var schedule: [Sample.Entry] { Sample.schedule }

    var today: [Sample.Entry] {
        schedule.filter { Calendar.current.isDateInToday($0.start) }
    }

    /// The thing the web app pulls out as the "highlighted event" — the next
    /// one that has not finished yet.
    var next: Sample.Entry? {
        let now = Date.now
        return schedule.first { ($0.end ?? $0.start) > now } ?? schedule.first
    }

    var upcoming: [Sample.Entry] {
        guard let next else { return schedule }
        return schedule.filter { $0.start > next.start }
    }

    var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<12: "Good morning,"
        case 12..<18: "Good afternoon,"
        default: "Good evening,"
        }
    }

    var todayLine: String {
        let count = today.count
        let tasks = Sample.todos.filter { !$0.done }.count
        let habits = Sample.habits.filter { $0.done }.count
        return "\(count) \(count == 1 ? "thing" : "things") on today · \(tasks) to-do · \(habits)/\(Sample.habits.count) habits"
    }
}
