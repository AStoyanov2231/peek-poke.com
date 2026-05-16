import UIKit
import WebKit
import Capacitor

/// Per-tab Capacitor bridge view controller. One instance per tab means each tab
/// retains its own DOM, scroll position, and history — no reparenting on tab switch.
class WebTabBridgeViewController: CAPBridgeViewController {

    private let route: String
    private let isTransparent: Bool
    private var bridgePlugin: PeekPokeBridgePlugin?

    init(route: String, transparent: Bool = false) {
        self.route = route
        self.isTransparent = transparent
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Capacitor lifecycle

    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        if isTransparent {
            // Inject before React hydrates so the transparent layout is applied on first paint,
            // and on every subsequent navigation in this WebView.
            config.userContentController.addUserScript(WKUserScript(
                source: "document.documentElement.classList.add('native-map')",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
        }
        return config
    }

    override public func capacitorDidLoad() {
        let plugin = PeekPokeBridgePlugin()
        bridge?.registerPluginInstance(plugin)
        bridgePlugin = plugin

        if isTransparent {
            webView?.isOpaque = false
            webView?.backgroundColor = .clear
            webView?.scrollView.backgroundColor = .clear
            if #available(iOS 15.0, *) {
                webView?.underPageBackgroundColor = .clear
            }
            view.isOpaque = false
            view.backgroundColor = .clear
        } else {
            // Capacitor's default WKWebView ships with a clear background and the
            // CAPBridgeViewController.view has no enforced backgroundColor — without
            // this, the Mapbox MapView in the map tab bleeds through the status bar
            // and home-indicator edges of opaque web tabs.
            // Use a fixed white to match the web content (which has no dark-mode styles).
            // .systemBackground would go black in system dark mode, creating a dark strip
            // at the bottom safe area where the scroll view background is exposed.
            let appBackground = UIColor(red: 0.975, green: 0.974, blue: 0.977, alpha: 1)
            view.backgroundColor = appBackground
            webView?.isOpaque = true
            webView?.backgroundColor = appBackground
            webView?.scrollView.backgroundColor = appBackground
            if #available(iOS 15.0, *) {
                webView?.underPageBackgroundColor = appBackground
            }
        }
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        // super calls loadWebView() which starts loading the root URL ("/").
        // Immediately replace with our tab's route so this WebView opens on the right page.
        if route != "/", let url = buildRouteURL() {
            _ = webView?.load(URLRequest(url: url))
        }
    }

    // MARK: - Event emitters (called by RootTabBarController)

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

    private func buildRouteURL() -> URL? {
        guard let startURL = bridge?.config.appStartServerURL,
              var comps = URLComponents(url: startURL, resolvingAgainstBaseURL: false) else { return nil }
        comps.path = route
        comps.query = nil
        comps.fragment = nil
        return comps.url
    }

    private func emit(event: String, payload: [String: Any]) {
        bridgePlugin?.notifyListeners(event, data: payload, retainUntilConsumed: true)
    }
}
