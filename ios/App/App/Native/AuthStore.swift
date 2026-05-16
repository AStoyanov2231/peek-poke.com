import Foundation
import Security
import Combine

struct AuthSession {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date?
}

final class AuthStore: ObservableObject {
    static let shared = AuthStore()

    private let service = "com.peekpoke.app"
    private let accessTokenKey = "supabase_access_token"
    private let refreshTokenKey = "supabase_refresh_token"
    private let expiresAtKey = "supabase_expires_at"

    @Published private(set) var session: AuthSession?
    @Published private(set) var isAuthenticated: Bool = false

    private init() {
        if let accessToken = read(account: accessTokenKey),
           let refreshToken = read(account: refreshTokenKey) {
            var expiresAt: Date?
            if let raw = read(account: expiresAtKey), let interval = TimeInterval(raw) {
                expiresAt = Date(timeIntervalSince1970: interval)
            }
            session = AuthSession(accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt)
        }
        isAuthenticated = session != nil
    }

    func update(_ session: AuthSession?) {
        if let session {
            write(account: accessTokenKey, value: session.accessToken)
            write(account: refreshTokenKey, value: session.refreshToken)
            if let expiresAt = session.expiresAt {
                write(account: expiresAtKey, value: String(expiresAt.timeIntervalSince1970))
            } else {
                write(account: expiresAtKey, value: nil)
            }
        } else {
            write(account: accessTokenKey, value: nil)
            write(account: refreshTokenKey, value: nil)
            write(account: expiresAtKey, value: nil)
        }

        DispatchQueue.main.async {
            self.session = session
            self.isAuthenticated = session != nil
        }
    }

    func clear() {
        update(nil)
    }

    // MARK: Keychain primitives

    private func write(account: String, value: String?) {
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        guard let value, let data = value.data(using: .utf8) else {
            SecItemDelete(baseQuery as CFDictionary)
            return
        }
        let updateAttrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(baseQuery as CFDictionary, updateAttrs as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(addQuery as CFDictionary, nil)
        }
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
