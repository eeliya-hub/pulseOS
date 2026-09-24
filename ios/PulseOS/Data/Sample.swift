import Foundation
import SwiftUI

/// Stand-in data for every section, so the whole app can be designed and judged
/// before any of it is wired to the backend.
///
/// Shapes deliberately match the real payloads in `Net/Backend.swift` and the
/// web client, so swapping a section over is a change of source, not a change of
/// model.
enum Sample {
    static let name = "Eeliya"
    static let city = "Ghent"

    // MARK: Calendar

    static func at(_ hour: Int, _ minute: Int = 0, dayOffset: Int = 0) -> Date {
        let cal = Calendar.current
        let base = cal.date(byAdding: .day, value: dayOffset, to: .now) ?? .now
        return cal.date(bySettingHour: hour, minute: minute, second: 0, of: base) ?? base
    }

    struct Entry: Identifiable, Hashable {
        let id = UUID()
        let title: String
        let start: Date
        let end: Date?
        let location: String?
        let calendar: String
        let tint: Color
        var allDay: Bool = false
    }

    static let schedule: [Entry] = [
        Entry(title: "Project Sync", start: at(10), end: at(11),
              location: "Google Meet", calendar: "Work", tint: Color(hex: 0x5aa8ff)),
        Entry(title: "Tech Support Shift", start: at(14), end: at(18),
              location: "Library IT Desk", calendar: "Work", tint: Color(hex: 0x5aa8ff)),
        Entry(title: "Gym", start: at(20), end: at(21, 15),
              location: nil, calendar: "Personal", tint: Color(hex: 0xfb7185)),
        Entry(title: "Coffee with Maya", start: at(13, 0, dayOffset: 1), end: at(14, 0, dayOffset: 1),
              location: "Soho", calendar: "Personal", tint: Color(hex: 0xfbbf24)),
        Entry(title: "Theory Test", start: at(14, 0, dayOffset: 2), end: at(15, 0, dayOffset: 2),
              location: "Ashford Test Centre", calendar: "Personal", tint: Color(hex: 0xfbbf24)),
        Entry(title: "HCI coursework due", start: at(9, 0, dayOffset: 3), end: nil,
              location: nil, calendar: "University", tint: Color(hex: 0xa78bfa), allDay: true),
        Entry(title: "Orthodontist", start: at(11, 0, dayOffset: 4), end: at(11, 45, dayOffset: 4),
              location: "Kennington", calendar: "Personal", tint: Color(hex: 0xfb7185)),
    ]

    // MARK: Life Hub

    struct Task: Identifiable, Hashable {
        let id = UUID()
        var title: String
        var done: Bool
        var note: String?
    }

    static let todos: [Task] = [
        Task(title: "Buy groceries", done: false, note: nil),
        Task(title: "Call mom", done: false, note: nil),
        Task(title: "Renew railcard", done: true, note: "Expires Friday"),
        Task(title: "Send design draft", done: false, note: "To Luke"),
    ]

    struct Habit: Identifiable, Hashable {
        let id = UUID()
        let title: String
        var done: Bool
        let streak: Int
    }

    static let habits: [Habit] = [
        Habit(title: "Morning workout", done: true, streak: 12),
        Habit(title: "Read 20 pages", done: false, streak: 5),
        Habit(title: "Drink 2L water", done: false, streak: 21),
    ]

    struct Project: Identifiable, Hashable {
        let id = UUID()
        let title: String
        let tasks: [Task]
        var tint: Color
    }

    static let projects: [Project] = [
        Project(title: "Pulse OS", tasks: [
            Task(title: "Weather card polish", done: true, note: nil),
            Task(title: "Life Hub rebuild", done: true, note: nil),
            Task(title: "iPhone client", done: false, note: nil),
        ], tint: Color(hex: 0x5aa8ff)),
        Project(title: "HCI Coursework", tasks: [
            Task(title: "Prototype critique", done: false, note: nil),
            Task(title: "Write evaluation", done: false, note: nil),
        ], tint: Color(hex: 0xa78bfa)),
        Project(title: "Portfolio v2", tasks: [
            Task(title: "Re-shoot PulseOS", done: true, note: nil),
        ], tint: Color(hex: 0xfbbf24)),
    ]

    // MARK: Weather

    struct Hour: Identifiable, Hashable {
        let id = UUID()
        let date: Date
        let temp: Int
        let icon: String
        let rain: Int
    }

    struct Day: Identifiable, Hashable {
        let id = UUID()
        let date: Date
        let low: Int
        let high: Int
        let icon: String
        let condition: String
    }

    static let currentTemp = 23
    static let currentCondition = "Broken clouds"
    static let currentIcon = "04d"
    static let feelsLike = 22
    static let humidity = 68
    static let wind = 5
    static let rainChance = 10
    static let uvIndex = 4
    static let airQuality = 32
    static let sunrise = at(6, 58)
    static let sunset = at(19, 41)

    static let hours: [Hour] = (0..<24).map { i in
        let temps = [23, 23, 22, 21, 20, 19, 18, 17, 16, 16, 15, 15, 14, 14, 15, 17, 19, 21, 22, 23, 23, 22, 21, 20]
        let icons = ["04d", "03d", "02d", "01n", "01n", "01n", "02n", "02n", "03n", "03n", "09n", "10n",
                     "04n", "04n", "03d", "02d", "01d", "01d", "02d", "03d", "04d", "03d", "02n", "01n"]
        return Hour(
            date: Calendar.current.date(byAdding: .hour, value: i, to: .now) ?? .now,
            temp: temps[i % temps.count],
            icon: icons[i % icons.count],
            rain: [0, 0, 5, 10, 0, 0, 20, 45, 60, 30, 10, 0][i % 12]
        )
    }

    static let days: [Day] = [
        Day(date: at(12, 0, dayOffset: 0), low: 13, high: 23, icon: "04d", condition: "Broken clouds"),
        Day(date: at(12, 0, dayOffset: 1), low: 11, high: 21, icon: "01d", condition: "Clear"),
        Day(date: at(12, 0, dayOffset: 2), low: 11, high: 21, icon: "03d", condition: "Cloudy"),
        Day(date: at(12, 0, dayOffset: 3), low: 13, high: 19, icon: "10d", condition: "Light rain"),
        Day(date: at(12, 0, dayOffset: 4), low: 10, high: 23, icon: "01d", condition: "Clear"),
        Day(date: at(12, 0, dayOffset: 5), low: 13, high: 22, icon: "02d", condition: "Few clouds"),
        Day(date: at(12, 0, dayOffset: 6), low: 12, high: 20, icon: "04d", condition: "Overcast"),
    ]

    // MARK: Markets

    struct Instrument: Identifiable, Hashable {
        let id = UUID()
        let symbol: String
        let name: String
        let price: Double
        let change: Double
        var crypto: Bool = false
    }

    static let watchlist: [Instrument] = [
        Instrument(symbol: "AAPL", name: "Apple Inc", price: 336.13, change: -0.26),
        Instrument(symbol: "NVDA", name: "NVIDIA Corp", price: 222.27, change: 1.34),
        Instrument(symbol: "TSLA", name: "Tesla Inc", price: 364.27, change: -0.53),
        Instrument(symbol: "MSFT", name: "Microsoft Corp", price: 493.78, change: -0.80),
        Instrument(symbol: "AMZN", name: "Amazon.com Inc", price: 253.71, change: 1.00),
        Instrument(symbol: "GOOGL", name: "Alphabet Inc", price: 349.54, change: 0.64),
        Instrument(symbol: "BTC", name: "Bitcoin", price: 85_241, change: 6.10, crypto: true),
        Instrument(symbol: "ETH", name: "Ethereum", price: 2_726.39, change: 5.90, crypto: true),
    ]

    struct Headline: Identifiable, Hashable {
        let id = UUID()
        let title: String
        let source: String
        let ago: String
    }

    static let topNews: [Headline] = [
        Headline(title: "ASX slides lower as oil and bonds weigh on Wall Street", source: "smh.com.au", ago: "12h ago"),
        Headline(title: "Lenovo crowns 2026 partner award winners", source: "Reseller News", ago: "12h ago"),
        Headline(title: "Trading ideas: AirAsia, EcoWorld, TMK Chemical, Zetrix AI", source: "The Star", ago: "12h ago"),
        Headline(title: "\"Four Hands, Two Sonatas\" ratings climb to new all-time high", source: "Soompi", ago: "13h ago"),
        Headline(title: "Engineers examine fire-ravaged landmark hotel", source: "KentOnline", ago: "14h ago"),
    ]

    static let localNews: [Headline] = [
        Headline(title: "Spectacular former Kent home of Mr Men creator for sale", source: "Kent Live", ago: "2d ago"),
        Headline(title: "Week-long Kent river festival returns with new name", source: "Kent Live", ago: "2d ago"),
        Headline(title: "Kent pub 'haunted' by 18th century ghost up for auction", source: "Kent Live", ago: "2d ago"),
        Headline(title: "The magical short walk in Kent with stunning views", source: "Kent Live", ago: "3d ago"),
    ]

    static let channels = ["Sky News", "BBC News", "Al Jazeera", "France 24", "DW"]

    struct TableRow: Identifiable, Hashable {
        let id = UUID()
        let position: Int
        let name: String
        let played: Int
        let diff: Int
        let points: Int
        var highlighted: Bool = false
    }

    static let premierLeague: [TableRow] = [
        TableRow(position: 1, name: "Manchester City", played: 5, diff: 8, points: 15),
        TableRow(position: 2, name: "Arsenal", played: 5, diff: 4, points: 12, highlighted: true),
        TableRow(position: 3, name: "Brighton", played: 5, diff: 11, points: 10),
        TableRow(position: 4, name: "Brentford", played: 5, diff: 6, points: 9),
        TableRow(position: 5, name: "Leeds United", played: 5, diff: 4, points: 9),
        TableRow(position: 6, name: "Liverpool", played: 5, diff: 3, points: 9),
        TableRow(position: 7, name: "Everton", played: 5, diff: 3, points: 9),
        TableRow(position: 8, name: "Hull City", played: 5, diff: 2, points: 8),
    ]

    static let f1Drivers: [TableRow] = [
        TableRow(position: 1, name: "Andrea Kimi Antonelli", played: 0, diff: 0, points: 291),
        TableRow(position: 2, name: "George Russell", played: 0, diff: 0, points: 248),
        TableRow(position: 3, name: "Lewis Hamilton", played: 0, diff: 0, points: 199),
        TableRow(position: 4, name: "Lando Norris", played: 0, diff: 0, points: 188),
        TableRow(position: 5, name: "Charles Leclerc", played: 0, diff: 0, points: 166),
        TableRow(position: 6, name: "Max Verstappen", played: 0, diff: 0, points: 149),
    ]

    static let nextFixture = (competition: "Premier League", home: "Arsenal FC",
                              away: "Leeds United FC", when: "Sat 10 Oct", time: "11:30")
    static let nextRace = (name: "Azerbaijan Grand Prix", circuit: "Baku City Circuit",
                           when: "Sat 26 Sept", time: "11:00")

    // MARK: Music

    struct Track: Identifiable, Hashable {
        let id = UUID()
        let title: String
        let artist: String
        let album: String
        let duration: String
        var art: Color
    }

    static let nowPlaying = Track(title: "All Of The Lights", artist: "Kanye West",
                                  album: "My Beautiful Dark Twisted Fantasy",
                                  duration: "4:59", art: Color(hex: 0xf5333f))
    static let playedSeconds: Double = 141
    static let totalSeconds: Double = 299

    static let recent: [Track] = [
        Track(title: "More Than Friends", artist: "James Hype, Kelli-Leigh", album: "Single", duration: "2:20", art: Color(hex: 0xe8447a)),
        Track(title: "Blood on the Dance Floor", artist: "Michael Jackson", album: "Blood on the Dance Floor", duration: "4:14", art: Color(hex: 0x9a3412)),
        Track(title: "Passionfruit", artist: "Drake", album: "More Life", duration: "4:58", art: Color(hex: 0x1d4ed8)),
        Track(title: "Sacrifice", artist: "The Weeknd", album: "Dawn FM", duration: "3:08", art: Color(hex: 0x374151)),
        Track(title: "Ivy", artist: "Frank Ocean", album: "Blonde", duration: "4:09", art: Color(hex: 0xf59e0b)),
    ]

    struct Playlist: Identifiable, Hashable {
        let id = UUID()
        let name: String
        let count: Int
        var tint: Color
    }

    static let playlists: [Playlist] = [
        Playlist(name: "UK House", count: 84, tint: Color(hex: 0x8b5cf6)),
        Playlist(name: "Arabic", count: 52, tint: Color(hex: 0x14b8a6)),
        Playlist(name: "Sormeh music", count: 128, tint: Color(hex: 0xef4444)),
        Playlist(name: "Türkçe Afro House", count: 39, tint: Color(hex: 0xf59e0b)),
        Playlist(name: "Michael", count: 61, tint: Color(hex: 0x3b82f6)),
        Playlist(name: "Club", count: 143, tint: Color(hex: 0xec4899)),
    ]

    static let lyrics: [(at: Double, line: String)] = [
        (128, "Cop lights, flashlights, spotlights"),
        (133, "Strobe lights, street lights"),
        (137, "All of the lights, all of the lights"),
        (142, "Fast life, drug life, thug life"),
        (146, "Rock life, every night"),
        (150, "All of the lights"),
    ]

    // MARK: Travel

    struct Plan: Identifiable, Hashable {
        let id = UUID()
        let time: String
        let title: String
        let place: String?
        var done: Bool
    }

    struct TripDay: Identifiable, Hashable {
        let id = UUID()
        let label: String
        let date: String
        let plans: [Plan]
    }

    static let trip = (name: "Tokyo escape", place: "Tokyo, Japan", flag: "🇯🇵",
                       dates: "20 Aug – 2 Sept", nights: 13, localTime: "21:47",
                       temp: 23, condition: "Moderate rain", plug: "Type A/B, 100V",
                       drives: "left", dial: "+81", emergency: "110 / 119",
                       rate: "1 GBP = 210.69 JPY")

    static let flight = (number: "JL044", airline: "Japan Airlines", date: "20 Aug 2026",
                         from: "LHR", fromCity: "London", depart: "19:20",
                         to: "HND", toCity: "Tokyo", arrive: "17:20", plus: "+1d",
                         distance: "9,591 km", duration: "14h 00m")

    static let tripDays: [TripDay] = [
        TripDay(label: "Day 1", date: "20 Aug", plans: [
            Plan(time: "09:10", title: "Land at Haneda", place: "HND", done: true),
            Plan(time: "16:30", title: "Shibuya crossing walk", place: "Shibuya Scramble", done: true),
            Plan(time: "19:30", title: "Ramen reset", place: "Ichiran Shibuya", done: false),
        ]),
        TripDay(label: "Day 2", date: "21 Aug", plans: [
            Plan(time: "08:00", title: "Tsukiji outer market", place: "Tsukiji", done: false),
            Plan(time: "13:00", title: "teamLab Planets", place: "Toyosu", done: false),
            Plan(time: "19:00", title: "Golden Gai", place: "Shinjuku", done: false),
        ]),
        TripDay(label: "Day 3", date: "22 Aug", plans: [
            Plan(time: "07:30", title: "Day trip to Hakone", place: "Odawara line", done: false),
            Plan(time: "12:00", title: "Lake Ashi cruise", place: "Hakone", done: false),
        ]),
    ]

    static let packing: [Task] = [
        Task(title: "Passport & tickets", done: true, note: nil),
        Task(title: "JR Pass voucher", done: true, note: nil),
        Task(title: "Type A adapter", done: false, note: nil),
        Task(title: "Pocket wifi", done: false, note: nil),
        Task(title: "Suica top-up", done: false, note: nil),
        Task(title: "Rain shell", done: false, note: nil),
    ]

    static let places: [(name: String, kind: String)] = [
        ("Park Hotel Tokyo", "Stay"),
        ("Shibuya Scramble", "Place"),
        ("teamLab Planets", "Place"),
        ("Haneda Airport", "Airport"),
    ]

    // MARK: Assistant

    struct Message: Identifiable, Hashable {
        let id = UUID()
        let fromPulse: Bool
        let text: String
    }

    static let conversation: [Message] = [
        Message(fromPulse: false, text: "What's on my calendar today, and what's the weather doing?"),
        Message(fromPulse: true, text: """
        You have a busy afternoon ahead with a bit of an overlap in your schedule:

        **14:00 – 18:00**  Tech Support Shift at the Library IT Desk.
        **20:00**  Gym.

        Your Project Sync (10:00 – 11:00) is already finished for the day.

        **Weather in Ghent**
        It's 23° with broken clouds, staying dry with a high of 23° and a low of 13° tonight.
        """),
    ]

    static let suggestions = [
        "What's on my calendar today?",
        "What did I have on last week?",
        "What's the news today?",
        "Add gym tomorrow at 8",
    ]

    static let conversations = [
        "What's on my calendar today…",
        "Plan the Tokyo itinerary",
        "Summarise this week's markets",
    ]
}
