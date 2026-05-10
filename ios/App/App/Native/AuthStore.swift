import Foundation
import Security
import Combine

final class AuthStore: ObservableObject {
    static let shared = AuthStore()

    private let service = "com.peekpoke.app"
    private let accessTokenKey = "supabase_access_token"
    private let refreshTokenKey = "supabase_refresh_token"
    private let expiresAtKey = "supabase_expires_at"

    @Published private(set) var accessToken: String?
    @Published private(set) var refreshToken: String?
    @Published private(set) var expiresAt: Date?
    @Published private(set) var isAuthenticated: Bool = false

    private init() {
        accessToken = read(account: accessTokenKey)
        refreshToken = read(account: refreshTokenKey)
        if let raw = read(account: expiresAtKey), let interval = TimeInterval(raw) {
            expiresAt = Date(timeIntervalSince1970: interval)
        }
        isAuthenticated = accessToken != nil
    }

    func update(accessToken: String?, refreshToken: String?, expiresAt: Date?) {
        write(account: accessTokenKey, value: accessToken)
        write(account: refreshTokenKey, value: refreshToken)
        if let expiresAt {
            write(account: expiresAtKey, value: String(expiresAt.timeIntervalSince1970))
        } else {
            write(account: expiresAtKey, value: nil)
        }

        DispatchQueue.main.async {
            self.accessToken = accessToken
            self.refreshToken = refreshToken
            self.expiresAt = expiresAt
            self.isAuthenticated = accessToken != nil
        }
    }

    func clear() {
        update(accessToken: nil, refreshToken: nil, expiresAt: nil)
    }

    // MARK: Keychain primitives

    private func write(account: String, value: String?) {
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(baseQuery as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    private func read(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }
        return string
    }
}
