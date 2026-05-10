import Foundation
import UIKit

struct NativeAuthTokens {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date?
}

enum NativeAuthError: Error {
    case missingSession
}

actor NativeAuthCoordinator {
    static let shared = NativeAuthCoordinator()

    private var refreshTask: Task<NativeAuthTokens, Error>?

    func accessToken() async throws -> String {
        guard let token = AuthStore.shared.accessToken else {
            throw NativeAuthError.missingSession
        }

        if let expiresAt = AuthStore.shared.expiresAt,
           expiresAt.timeIntervalSinceNow < 60 {
            return try await refreshSession().accessToken
        }

        return token
    }

    func refreshSession() async throws -> NativeAuthTokens {
        if let refreshTask {
            return try await refreshTask.value
        }

        guard let refreshToken = AuthStore.shared.refreshToken else {
            throw NativeAuthError.missingSession
        }

        let task = Task<NativeAuthTokens, Error> {
            let tokens = try await SupabaseService.shared.refreshSession(refreshToken: refreshToken)
            await MainActor.run {
                AuthStore.shared.update(
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt
                )
                Self.notifyWebSession(tokens)
            }
            return tokens
        }

        refreshTask = task
        do {
            let tokens = try await task.value
            refreshTask = nil
            return tokens
        } catch {
            refreshTask = nil
            throw error
        }
    }

    @MainActor
    private static func notifyWebSession(_ tokens: NativeAuthTokens) {
        guard let container = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.windows.first?.rootViewController as? RootContainerViewController,
              let tabBar = container.tabBar else {
            return
        }

        tabBar.sharedBridgeVC.notifyAuthRefresh(
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt?.timeIntervalSince1970 ?? 0
        )
    }
}
