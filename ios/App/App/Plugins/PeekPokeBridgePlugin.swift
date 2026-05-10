import Capacitor
import UIKit

/// Typed Capacitor plugin that replaces the hand-rolled webkit.messageHandlers.nativeBridge.
/// Web → Native: setAuth, clearAuth, getAuth, setRole, setTabBadge, setAppBadge,
///                notifyReady, setLastRoute, openExternal, requestPushPermission
/// Native → Web: navigate, appResumed, refreshNeeded, pushReceived, authRefresh
@objc(PeekPokeBridgePlugin)
public class PeekPokeBridgePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "PeekPokeBridgePlugin"
    public let jsName = "PeekPokeBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAuth",              returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAuth",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuth",              returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRole",              returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTabBadge",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppBadge",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyReady",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLastRoute",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPushPermission", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Web → Native calls

    @objc func setAuth(_ call: CAPPluginCall) {
        let accessToken  = call.getString("accessToken")
        let refreshToken = call.getString("refreshToken")
        var expiresAt: Date?
        if let n = call.getDouble("expiresAt") {
            expiresAt = Date(timeIntervalSince1970: n)
        } else if let n = call.getInt("expiresAt") {
            expiresAt = Date(timeIntervalSince1970: TimeInterval(n))
        }
        AuthStore.shared.update(accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt)
        call.resolve()
    }

    @objc func clearAuth(_ call: CAPPluginCall) {
        // RootContainerViewController observes AuthStore.isAuthenticated and
        // automatically swaps back to the login WebView on clear.
        AuthStore.shared.clear()
        call.resolve()
    }

    @objc func getAuth(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        if let t = AuthStore.shared.accessToken  { result["accessToken"]  = t }
        if let t = AuthStore.shared.refreshToken { result["refreshToken"] = t }
        if let d = AuthStore.shared.expiresAt    { result["expiresAt"]    = d.timeIntervalSince1970 }
        call.resolve(result)
    }

    @objc func setRole(_ call: CAPPluginCall) {
        let isAdmin = call.getBool("isAdmin") ?? false
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .peekPokeRoleChanged,
                object: nil,
                userInfo: ["isAdmin": isAdmin]
            )
        }
        call.resolve()
    }

    @objc func setTabBadge(_ call: CAPPluginCall) {
        let tab   = call.getString("tab") ?? ""
        let count = call.getInt("count") ?? 0
        DispatchQueue.main.async {
            Self.tabBar()?.setBadge(tab: tab, count: count)
        }
        call.resolve()
    }

    @objc func setAppBadge(_ call: CAPPluginCall) {
        let count = call.getInt("count") ?? 0
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = count
        }
        call.resolve()
    }

    @objc func notifyReady(_ call: CAPPluginCall) {
        call.resolve()
        // Splash screen auto-hides once the bridge view controller signals ready.
        // CAPBridgeViewController handles this internally when the WebView finishes loading.
    }

    @objc func setLastRoute(_ call: CAPPluginCall) {
        let tab   = call.getString("tab") ?? ""
        let route = call.getString("route") ?? ""
        guard !tab.isEmpty, !route.isEmpty else { call.resolve(); return }
        DispatchQueue.main.async {
            Self.tabBar()?.setLastRoute(tab: tab, route: route)
        }
        call.resolve()
    }

    /// Resolves the active tab bar through `RootContainerViewController`.
    /// Returns nil when the user is unauthenticated (login WebView is showing).
    private static func tabBar() -> RootTabBarController? {
        let container = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.rootViewController as? RootContainerViewController
        return container?.tabBar
    }

    @objc func openExternal(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        call.resolve()
    }

    @objc func requestPushPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
        call.resolve()
    }
}
