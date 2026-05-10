import Foundation
import Combine
import Supabase

/// Singleton wrapper around supabase-swift. Keeps the realtime/auth session
/// in sync with whatever AuthStore currently holds, sourced from the JS bridge.
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient
    private var cancellables = Set<AnyCancellable>()
    private var lastAppliedAccessToken: String?

    private init() {
        self.client = SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    emitLocalSessionAsInitialSession: true
                )
            )
        )

        // Apply whatever token is currently in AuthStore on launch.
        applyToken(AuthStore.shared.accessToken, refreshToken: AuthStore.shared.refreshToken)

        // Then react to subsequent token changes published by AuthStore.
        AuthStore.shared.$accessToken
            .removeDuplicates()
            .sink { [weak self] token in
                self?.applyToken(token, refreshToken: AuthStore.shared.refreshToken)
            }
            .store(in: &cancellables)
    }

    private func applyToken(_ accessToken: String?, refreshToken: String?) {
        Task {
            if let accessToken, let refreshToken {
                if accessToken == lastAppliedAccessToken {
                    await client.realtime.setAuth(accessToken)
                    return
                }

                do {
                    let session = try await client.auth.setSession(
                        accessToken: accessToken,
                        refreshToken: refreshToken
                    )
                    let tokens = tokens(from: session)
                    lastAppliedAccessToken = tokens.accessToken
                    if tokens.accessToken != accessToken || tokens.refreshToken != refreshToken {
                        AuthStore.shared.update(
                            accessToken: tokens.accessToken,
                            refreshToken: tokens.refreshToken,
                            expiresAt: tokens.expiresAt
                        )
                    }
                    await client.realtime.setAuth(tokens.accessToken)
                } catch {
                    #if DEBUG
                    print("[Supabase] setSession failed: \(error)")
                    #endif
                    await client.realtime.setAuth(accessToken)
                }
            } else {
                lastAppliedAccessToken = nil
                try? await client.auth.signOut()
                await client.realtime.setAuth(nil)
            }
        }
    }

    func refreshSession(refreshToken: String) async throws -> NativeAuthTokens {
        let session = try await client.auth.refreshSession(refreshToken: refreshToken)
        let tokens = tokens(from: session)
        lastAppliedAccessToken = tokens.accessToken
        await client.realtime.setAuth(tokens.accessToken)
        return tokens
    }

    private func tokens(from session: Session) -> NativeAuthTokens {
        NativeAuthTokens(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresAt: Date(timeIntervalSince1970: TimeInterval(session.expiresAt))
        )
    }
}
