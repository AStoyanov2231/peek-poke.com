import UIKit

final class RootTabBarController: UITabBarController {

    // The single Capacitor WebView instance shared across all web tabs
    let sharedBridgeVC = SharedBridgeViewController()

    private var isAdminVisible: Bool = false
    private var currentWebTab: String = "inbox"

    // Per-tab last-known routes (maintained by setLastRoute calls from web)
    private(set) var lastRoutes: [String: String] = [
        "inbox":   "/inbox",
        "profile": "/profile",
        "admin":   "/admin",
    ]

    // Inset tab bar items (badges updated independently via plugin)
    private let inboxItem   = UITabBarItem(title: "Inbox",   image: UIImage(systemName: "envelope"), tag: 1)
    private let profileItem = UITabBarItem(title: "Me",      image: UIImage(systemName: "person"),   tag: 2)
    private let adminItem   = UITabBarItem(title: "Admin",   image: UIImage(systemName: "shield"),   tag: 3)

    // Proxy view controllers — zero UI, their only role is to carry tab bar items
    // and provide a view container for the shared bridge when their tab is selected.
    private lazy var inboxProxyVC: UIViewController   = makeProxy(item: inboxItem)
    private lazy var profileProxyVC: UIViewController = makeProxy(item: profileItem)
    private lazy var adminProxyVC: UIViewController   = makeProxy(item: adminItem)

    private lazy var mapVC: UIViewController = {
        let vc = MapTabViewController()
        vc.tabBarItem = UITabBarItem(title: "Map", image: UIImage(systemName: "map"), tag: 0)
        return vc
    }()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        delegate = self

        // Pre-load bridge so Capacitor is ready before first tab switch
        _ = sharedBridgeVC.view

        rebuildTabs()

        // Start on the map tab with the bridge as a transparent overlay
        embedBridge(in: mapVC, navigate: true, route: "/")
        setMapOverlayMode(true)

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleRoleChange(_:)),
            name: .peekPokeRoleChanged, object: nil
        )
    }

    // MARK: - Public API (called by PeekPokeBridgePlugin and MapTabViewController)

    func setLastRoute(tab: String, route: String) {
        dispatchPrecondition(condition: .onQueue(.main))
        lastRoutes[tab] = route
    }

    func setBadge(tab: String, count: Int) {
        dispatchPrecondition(condition: .onQueue(.main))
        let value: String? = count > 0 ? "\(count)" : nil
        switch tab {
        case "inbox":   inboxItem.badgeValue   = value
        case "profile": profileItem.badgeValue = value
        case "admin":   adminItem.badgeValue   = value
        default: break
        }
    }

    func currentRouteForResume() -> String {
        if selectedIndex == 0 { return "/" }
        return lastRoutes[currentWebTab] ?? "/\(currentWebTab)"
    }

    /// Switch to a web tab and SPA-navigate to the given route (or last known route).
    func switchToWebTab(_ logicalTab: String, route: String? = nil) {
        let target = route ?? lastRoutes[logicalTab] ?? "/\(logicalTab)"
        let proxyVC: UIViewController
        switch logicalTab {
        case "profile": proxyVC = profileProxyVC
        case "admin":   proxyVC = isAdminVisible ? adminProxyVC : profileProxyVC
        default:        proxyVC = inboxProxyVC
        }
        currentWebTab = logicalTab
        if let idx = viewControllers?.firstIndex(of: proxyVC) {
            selectedIndex = idx
        }
        embedBridge(in: proxyVC, navigate: true, route: target)
    }

    // MARK: - Private helpers

    private func rebuildTabs() {
        var vcs: [UIViewController] = [mapVC, inboxProxyVC, profileProxyVC]
        if isAdminVisible { vcs.append(adminProxyVC) }
        viewControllers = vcs
    }

    private func makeProxy(item: UITabBarItem) -> UIViewController {
        let vc = UIViewController()
        vc.view.backgroundColor = .systemBackground
        vc.tabBarItem = item
        return vc
    }

    private func setMapOverlayMode(_ on: Bool) {
        guard let wv = sharedBridgeVC.webView else { return }
        wv.isOpaque = !on
        wv.backgroundColor = on ? .clear : .systemBackground
        wv.scrollView.backgroundColor = on ? .clear : .systemBackground
        sharedBridgeVC.view.isOpaque = !on
        sharedBridgeVC.view.backgroundColor = on ? .clear : .systemBackground

        sharedBridgeVC.isMapOverlay = on
        (mapVC as? MapTabViewController)?.setOverlayActive(on)
        if on {
            sharedBridgeVC.applyMapOverlayCSS()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.sharedBridgeVC.applyMapOverlayCSS()
            }
        }
    }

    private func embedBridge(in parent: UIViewController, navigate: Bool, route: String? = nil) {
        // Move bridge view to the new parent if needed
        if sharedBridgeVC.parent !== parent {
            sharedBridgeVC.willMove(toParent: nil)
            sharedBridgeVC.view.removeFromSuperview()
            sharedBridgeVC.removeFromParent()

            parent.addChild(sharedBridgeVC)
            sharedBridgeVC.view.frame = parent.view.bounds
            sharedBridgeVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            parent.view.addSubview(sharedBridgeVC.view)
            sharedBridgeVC.didMove(toParent: parent)
        }

        guard navigate, let route else { return }
        sharedBridgeVC.navigateTo(route)
    }

    @objc private func handleRoleChange(_ note: Notification) {
        dispatchPrecondition(condition: .onQueue(.main))
        let isAdmin = (note.userInfo?["isAdmin"] as? Bool) ?? false
        guard isAdmin != isAdminVisible else { return }
        isAdminVisible = isAdmin
        let previousIndex = selectedIndex
        rebuildTabs()
        if previousIndex < (viewControllers?.count ?? 0) {
            selectedIndex = previousIndex
        }
    }
}

// MARK: - UITabBarControllerDelegate

extension RootTabBarController: UITabBarControllerDelegate {
    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        if viewController === mapVC {
            setMapOverlayMode(true)
            embedBridge(in: mapVC, navigate: true, route: "/")
            return
        }

        setMapOverlayMode(false)

        let tab: String
        switch viewController {
        case profileProxyVC: tab = "profile"
        case adminProxyVC:   tab = "admin"
        default:             tab = "inbox"
        }
        currentWebTab = tab
        let route = lastRoutes[tab] ?? "/\(tab)"
        embedBridge(in: viewController, navigate: true, route: route)
    }
}

// MARK: - Notification names

extension Notification.Name {
    static let peekPokeRoleChanged           = Notification.Name("peekPokeRoleChanged")
    static let peekPokeAuthTokenChanged      = Notification.Name("peekPokeAuthTokenChanged")
    static let peekPokeMapInteractiveRects   = Notification.Name("peekPokeMapInteractiveRects")
}
