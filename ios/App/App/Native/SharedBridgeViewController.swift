import UIKit
import WebKit
import Capacitor

/// The single persistent Capacitor bridge view controller hosting the entire web app.
/// Section switches are SPA navigations driven by the `navigate` event — the WebView,
/// its DOM, JS heap, React Query cache, and Supabase session live for the whole app
/// lifetime and are never reloaded or reparented on a tab switch.
final class MainBridgeViewController: CAPBridgeViewController {

    private var bridgePlugin: PeekPokeBridgePlugin?

    override public func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        // Apply the transparent-map layout before React hydrates so a full load that
        // lands on the map route paints transparent on the first frame. Client-side
        // route changes keep the class in sync from NativeBridgeProvider.
        config.userContentController.addUserScript(WKUserScript(
            source: "if (location.pathname === '/') document.documentElement.classList.add('native-map')",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        return config
    }

    override public func capacitorDidLoad() {
        let plugin = PeekPokeBridgePlugin()
        bridge?.registerPluginInstance(plugin)
        bridgePlugin = plugin

        // The WebView is permanently non-opaque: web paints an opaque body on every
        // route except the map ("/"), where `html.native-map` turns the background
        // transparent so the native Mapbox map shows through. Anything unpainted
        // falls through to RootShellViewController's light background, never black.
        webView?.isOpaque = false
        webView?.backgroundColor = .clear
        webView?.scrollView.backgroundColor = .clear
        if #available(iOS 15.0, *) {
            webView?.underPageBackgroundColor = .clear
        }
        view.isOpaque = false
        view.backgroundColor = .clear
    }

    // MARK: - Event emitters (called by RootShellViewController)

    func navigateTo(_ route: String, source: String = "tab") {
        emit(event: "navigate", payload: ["route": route, "source": source])
    }

    func notifyAppResumed() {
        emit(event: "appResumed", payload: [:])
    }

    func notifyAuthRefresh(accessToken: String, refreshToken: String, expiresAt: Double) {
        emit(event: "authRefresh", payload: [
            "accessToken": accessToken,
            "refreshToken": refreshToken,
            "expiresAt": expiresAt,
        ])
    }

    // MARK: - Private

    private func emit(event: String, payload: [String: Any]) {
        bridgePlugin?.notifyListeners(event, data: payload, retainUntilConsumed: true)
    }
}
