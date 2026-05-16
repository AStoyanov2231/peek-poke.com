import Capacitor
import UIKit

/// Typed Capacitor plugin bridging web ↔ native.
///
/// Web → Native calls:
///   setAuth, clearAuth, getAuth           — Keychain token management (AuthStore)
///   setRole                               — show/hide admin tab (lazy)
///   setTabBadge, setAppBadge              — badge counts
///   openExternal                          — open URL in Safari
///   setMapInteractiveRects                — touch passthrough hit areas
///   setMapPins, setMapCamera              — Mapbox annotation + camera control
///   setMapClusterConfig                   — reserved / no-op
///
/// Push notifications are handled by @capacitor/push-notifications (official plugin).
///
/// Native → Web events:
///   navigate          { route, source }
///   appResumed        { route }
///   authRefresh       { accessToken, refreshToken, expiresAt }
///   mapCameraChanged  { lat, lng, zoom, bearing, pitch, isUserGesture, bounds? }
///   mapPinTapped      { id, kind, childIds? }
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
        CAPPluginMethod(name: "openExternal",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMapInteractiveRects", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMapPins",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMapCamera",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMapClusterConfig",  returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Plugin lifecycle

    public override func load() {
        // Observe native map events and forward them to the web layer
        NotificationCenter.default.addObserver(
            self, selector: #selector(onNativeCameraChanged(_:)),
            name: .peekPokeMapCameraDidChange, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(onNativePinTapped(_:)),
            name: .peekPokeMapPinTapped, object: nil
        )
    }

    // MARK: - Web → Native calls

    @objc func setAuth(_ call: CAPPluginCall) {
        guard let accessToken  = call.getString("accessToken"),
              let refreshToken = call.getString("refreshToken") else {
            call.resolve()
            return
        }
        var expiresAt: Date?
        if let n = call.getDouble("expiresAt") {
            expiresAt = Date(timeIntervalSince1970: n)
        } else if let n = call.getInt("expiresAt") {
            expiresAt = Date(timeIntervalSince1970: TimeInterval(n))
        }
        AuthStore.shared.update(AuthSession(accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt))
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
        if let session = AuthStore.shared.session {
            result["accessToken"]  = session.accessToken
            result["refreshToken"] = session.refreshToken
            if let d = session.expiresAt { result["expiresAt"] = d.timeIntervalSince1970 }
        }
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

    @objc func setMapInteractiveRects(_ call: CAPPluginCall) {
        let raw = call.getArray("rects") ?? []
        let rects: [CGRect] = raw.compactMap { entry in
            guard let dict = entry as? [String: Any],
                  let x = (dict["x"] as? NSNumber)?.doubleValue,
                  let y = (dict["y"] as? NSNumber)?.doubleValue,
                  let w = (dict["width"] as? NSNumber)?.doubleValue,
                  let h = (dict["height"] as? NSNumber)?.doubleValue
            else { return nil }
            return CGRect(x: x, y: y, width: w, height: h)
        }
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .peekPokeMapInteractiveRects,
                object: nil,
                userInfo: ["rects": rects]
            )
        }
        call.resolve()
    }

    // MARK: - Map bridge (Web → Native)

    @objc func setMapPins(_ call: CAPPluginCall) {
        guard let rawPins = call.getArray("pins") else { call.resolve(); return }
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .peekPokeMapPins,
                object: nil,
                userInfo: ["pins": rawPins]
            )
        }
        call.resolve()
    }

    @objc func setMapCamera(_ call: CAPPluginCall) {
        let lat      = call.getDouble("lat") ?? 0
        let lng      = call.getDouble("lng") ?? 0
        let zoom     = call.getDouble("zoom") ?? 14
        let bearing  = call.getDouble("bearing") ?? 0
        let pitch    = call.getDouble("pitch") ?? 0
        let animated = call.getBool("animated") ?? true
        let duration = call.getDouble("durationMs") ?? 500
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .peekPokeMapCamera,
                object: nil,
                userInfo: [
                    "lat": lat, "lng": lng, "zoom": zoom,
                    "bearing": bearing, "pitch": pitch,
                    "animated": animated, "durationMs": duration,
                ]
            )
        }
        call.resolve()
    }

    @objc func setMapClusterConfig(_ call: CAPPluginCall) {
        // Reserved — native clustering config is currently set in MapTabViewController
        call.resolve()
    }

    // MARK: - Map bridge (Native → Web)

    @objc private func onNativeCameraChanged(_ note: Notification) {
        guard let info = note.userInfo as? [String: Any] else { return }
        notifyListeners("mapCameraChanged", data: info)
    }

    @objc private func onNativePinTapped(_ note: Notification) {
        guard let info = note.userInfo as? [String: Any] else { return }
        notifyListeners("mapPinTapped", data: info)
    }
}
