import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var shell: RootShellViewController? {
        window?.rootViewController as? RootShellViewController
    }

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        // The shell (and its single WebView) is installed exactly once and lives
        // for the whole app session. Auth changes only toggle the tab bar inside
        // it — they never tear the WebView down.
        window.rootViewController = RootShellViewController()
        window.makeKeyAndVisible()
        self.window = window

        // Cold launch via peekpoke:// (OAuth return from the system browser)
        for context in connectionOptions.urlContexts {
            handleOpenURL(context.url)
        }
    }

    // MARK: - Custom scheme (peekpoke://oauth-callback?code=…)

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            handleOpenURL(context.url)
        }
    }

    private func handleOpenURL(_ url: URL) {
        guard url.scheme == "peekpoke" else { return }
        NotificationCenter.default.post(
            name: .peekPokeOAuthCallback,
            object: nil,
            userInfo: ["url": url.absoluteString]
        )
    }

    // MARK: - Universal Links

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
        // Route supported web paths (e.g. invite links) into the SPA directly.
        if let url = userActivity.webpageURL, url.path.hasPrefix("/invite") {
            let route = url.query.map { "\(url.path)?\($0)" } ?? url.path
            shell?.bridgeVC.navigateTo(route, source: "deeplink")
        }
    }


    // MARK: - Foreground detection → notify WebView to re-validate session

    func sceneWillEnterForeground(_ scene: UIScene) {
        shell?.notifyCurrentBridgeAppResumed()
    }
}
