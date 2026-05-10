import UIKit
import Combine
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = RootContainerViewController()
        window.makeKeyAndVisible()
        self.window = window
    }

    // MARK: - Universal Links

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    // MARK: - Foreground detection → notify WebView to re-validate session

    func sceneWillEnterForeground(_ scene: UIScene) {
        guard let container = window?.rootViewController as? RootContainerViewController,
              let root = container.tabBar else { return }
        root.sharedBridgeVC.notifyAppResumed(route: root.currentRouteForResume())
    }
}

/// Root container that swaps between a bare login WebView and the full tab bar
/// based on `AuthStore.isAuthenticated`. Cold-launch with no Keychain token →
/// login WebView (no tabs). After web sign-in pushes tokens via PeekPokeBridge.setAuth,
/// the published `isAuthenticated` flips and we install the tab bar.
final class RootContainerViewController: UIViewController {
    private var currentChild: UIViewController?
    private var cancellables = Set<AnyCancellable>()

    /// The tab bar controller, if currently installed (i.e. authenticated).
    var tabBar: RootTabBarController? { currentChild as? RootTabBarController }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        installChild(authenticated: AuthStore.shared.isAuthenticated)

        AuthStore.shared.$isAuthenticated
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] isAuth in
                self?.installChild(authenticated: isAuth)
            }
            .store(in: &cancellables)
    }

    private func installChild(authenticated: Bool) {
        let new: UIViewController = authenticated
            ? RootTabBarController()
            : SharedBridgeViewController()

        if let old = currentChild {
            old.willMove(toParent: nil)
            old.view.removeFromSuperview()
            old.removeFromParent()
        }

        addChild(new)
        new.view.frame = view.bounds
        new.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(new.view)
        new.didMove(toParent: self)
        currentChild = new
    }
}
