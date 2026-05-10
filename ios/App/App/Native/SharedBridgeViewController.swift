import UIKit
import Capacitor

/// Single CAPBridgeViewController shared across all non-Map tabs.
/// Registers PeekPokeBridge and exposes helpers for tab-driven navigation.
class SharedBridgeViewController: CAPBridgeViewController {

    // MARK: - Capacitor lifecycle

    private var bridgePlugin: PeekPokeBridgePlugin?

    override public func capacitorDidLoad() {
        let plugin = PeekPokeBridgePlugin()
        bridge?.registerPluginInstance(plugin)
        bridgePlugin = plugin
    }

    // MARK: - Navigation helpers called by RootTabBarController

    /// Emit a navigate event to the web SPA.
    func navigateTo(_ route: String, source: String = "tab") {
        emit(event: "navigate", payload: ["route": route, "source": source])
    }

    /// Emit appResumed event (called on foreground by SceneDelegate).
    func notifyAppResumed(route: String) {
        emit(event: "appResumed", payload: ["route": route])
    }

    /// Ask the web side to refresh its Supabase session and push new tokens via setAuth.
    func notifyRefreshNeeded() {
        emit(event: "refreshNeeded", payload: ["reason": "401"])
    }

    /// After a native-side refresh, tell the web to sync its session.
    func notifyAuthRefresh(accessToken: String, refreshToken: String, expiresAt: Double) {
        emit(
            event: "authRefresh",
            payload: [
                "accessToken": accessToken,
                "refreshToken": refreshToken,
                "expiresAt": expiresAt,
            ]
        )
    }

    var isMapOverlay: Bool = false

    func applyMapOverlayCSS() {
        let css = """
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        document.querySelectorAll('.bg-background,.bg-surface').forEach(function(el){
            el.style.setProperty('background','transparent','important');
        });
        """
        webView?.evaluateJavaScript(css, completionHandler: nil)
    }

    private func emit(event: String, payload: [String: Any]) {
        // Use notifyListeners so PeekPokeBridge.addListener() on the web side receives these.
        // triggerJSEvent fires DOM CustomEvents — a different channel from Capacitor plugin listeners.
        bridgePlugin?.notifyListeners(event, data: payload, retainUntilConsumed: true)
    }
}
