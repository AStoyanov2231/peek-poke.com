import Foundation

struct ProfilePhoto: Decodable, Identifiable {
    let id: String
    let url: String
    let thumbnail_url: String?
    let is_avatar: Bool
    let is_private: Bool
    let display_order: Int
}

struct InterestTag: Decodable {
    let name: String
    let icon: String?
}

struct ProfileInterest: Decodable, Identifiable {
    let id: String
    let tag: InterestTag?
}

struct ProfileResponse: Decodable {
    let photos: [ProfilePhoto]?
    let interests: [ProfileInterest]?
    let bio: String?
    let display_name: String?
    let username: String?
}

struct CoinsResponse: Decodable {
    let balance: Int
}

enum APIError: Error {
    case notAuthenticated
    case requestFailed(Int)
    case decoding
    case invalidURL
}

final class APIClient {
    static let shared = APIClient()
    private init() {}

    private let session = URLSession.shared
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    func fetchProfile(userId: String) async throws -> ProfileResponse {
        try await get("/api/profile/\(userId)", as: ProfileResponse.self)
    }

    func fetchCoins() async throws -> CoinsResponse {
        try await get("/api/coins", as: CoinsResponse.self)
    }

    private func get<T: Decodable>(_ path: String, as: T.Type) async throws -> T {
        guard let url = URL(string: AppConfig.webOrigin + path) else {
            throw APIError.invalidURL
        }

        let (data, response) = try await sendAuthorizedRequest(url)
        return try decode(data: data, response: response, as: T.self)
    }

    private func sendAuthorizedRequest(_ url: URL) async throws -> (Data, URLResponse) {
        var request = try await makeRequest(url: url)
        let first = try await session.data(for: request)
        if (first.1 as? HTTPURLResponse)?.statusCode != 401 {
            return first
        }

        _ = try await NativeAuthCoordinator.shared.refreshSession()
        request = try await makeRequest(url: url)
        return try await session.data(for: request)
    }

    private func makeRequest(url: URL) async throws -> URLRequest {
        let token: String
        do {
            token = try await NativeAuthCoordinator.shared.accessToken()
        } catch {
            throw APIError.notAuthenticated
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func decode<T: Decodable>(data: Data, response: URLResponse, as: T.Type) throws -> T {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.requestFailed(-1)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.requestFailed(http.statusCode)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }
}
