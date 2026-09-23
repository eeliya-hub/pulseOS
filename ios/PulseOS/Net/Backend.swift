import Foundation

/// The one place the app talks to the Pulse OS backend.
///
/// Mirrors `frontend/src/services/api/backendClient.js`: same routes, same
/// shapes. During development that backend is the Express server on the Mac,
/// reached over the LAN; when it moves behind TLS only `baseURL` changes.
enum Backend {
    /// Simulator can use localhost. A real device cannot, so it needs the Mac's
    /// address on the network — overridable without a rebuild via the
    /// `PULSE_API` launch argument or environment variable.
    static let baseURL: URL = {
        if let override = ProcessInfo.processInfo.environment["PULSE_API"],
           let url = URL(string: override) {
            return url
        }
        #if targetEnvironment(simulator)
        return URL(string: "http://localhost:4000/api")!
        #else
        return URL(string: "http://192.168.1.12:4000/api")!
        #endif
    }()

    private static let decoder = JSONDecoder()

    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 12
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    struct Failure: LocalizedError {
        let path: String
        let reason: String
        var errorDescription: String? { "\(path): \(reason)" }
    }

    static func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        let (data, response) = try await session.data(from: components.url!)
        guard let http = response as? HTTPURLResponse else {
            throw Failure(path: path, reason: "no response")
        }
        guard (200..<300).contains(http.statusCode) else {
            // The backend answers 503 NOT_CONFIGURED for an integration with no
            // key rather than failing, so the message is worth surfacing.
            let body = String(data: data, encoding: .utf8) ?? ""
            throw Failure(path: path, reason: "HTTP \(http.statusCode) \(body.prefix(140))")
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw Failure(path: path, reason: "decode: \(error)")
        }
    }
}

// MARK: - Shapes

/// `GET /api/weather`
struct Weather: Decodable {
    let location: String
    let temp: Double
    let feelsLike: Double?
    let condition: String
    let description: String?
    let icon: String?
    let humidity: Int?
    let windSpeed: Double?
}

/// `GET /api/weather/forecast`
struct Forecast: Decodable {
    struct Point: Decodable, Identifiable {
        let time: Double
        let temp: Double
        let condition: String
        let icon: String?
        var id: Double { time }
        var date: Date { Date(timeIntervalSince1970: time / 1000) }
    }
    let location: String?
    let points: [Point]
}

/// `GET /api/calendar/events`
struct CalendarFeed: Decodable {
    let events: [Event]
}

struct Event: Decodable, Identifiable {
    let id: String?
    let title: String
    let location: String?
    let allDay: Bool?
    let start: Date
    let end: Date?
    let calendarName: String?
    let color: String?

    /// Events arrive as ISO-8601 with milliseconds, which the default date
    /// strategy will not take.
    enum CodingKeys: String, CodingKey {
        case id, title, location, allDay, start, end, calendarName, color
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "Untitled"
        location = try c.decodeIfPresent(String.self, forKey: .location)
        allDay = try c.decodeIfPresent(Bool.self, forKey: .allDay)
        calendarName = try c.decodeIfPresent(String.self, forKey: .calendarName)
        color = try c.decodeIfPresent(String.self, forKey: .color)
        start = try Event.date(from: c, key: .start) ?? .distantPast
        end = try Event.date(from: c, key: .end)
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()

    private static func date(
        from container: KeyedDecodingContainer<CodingKeys>,
        key: CodingKeys
    ) throws -> Date? {
        guard let raw = try container.decodeIfPresent(String.self, forKey: key) else { return nil }
        return iso.date(from: raw) ?? isoPlain.date(from: raw)
    }
}
