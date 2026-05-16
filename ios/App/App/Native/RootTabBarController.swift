import UIKit

final class RootTabBarController: UITabBarController {

    // Per-tab bridge view controllers — permanent for core tabs, lazy for admin
    let mapBridgeVC     = WebTabBridgeViewController(route: "/",        transparent: true)
    let inboxBridgeVC   = WebTabBridgeViewController(route: "/inbox",   transparent: false)
    let profileBridgeVC = WebTabBridgeViewController(route: "/profile", transparent: false)
    private var adminBridgeVC: WebTabBridgeViewController?

    private let mapVC = MapTabViewController()
    private var isAdminVisible: Bool = false

    private let inboxItem   = UITabBarItem(title: "Inbox", image: UIImage(systemName: "envelope"), tag: 1)
    private let profileItem = UITabBarItem(title: "Me",    image: UIImage(systemName: "person"),   tag: 2)
    private let adminItem   = UITabBarItem(title: "Admin", image: UIImage(systemName: "shield"),   tag: 3)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        delegate = self

        mapVC.tabBarItem           = UITabBarItem(title: "Map", image: UIImage(systemName: "map"), tag: 0)
        inboxBridgeVC.tabBarItem   = inboxItem
        profileBridgeVC.tabBarItem = profileItem

        mapVC.embedBridgeVC(mapBridgeVC)
        rebuildTabs()
        applyTabBarAppearance(transparent: true)

        // Warm core WebViews at launch so tab switches are instant (IG/FB pattern)
        // Admin WebView is warmed lazily only after setRole confirms the user is an admin.
        _ = inboxBridgeVC.view
        _ = profileBridgeVC.view

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleRoleChange(_:)),
            name: .peekPokeRoleChanged, object: nil
        )
    }

    // MARK: - Public API (called by PeekPokeBridgePlugin, SceneDelegate)

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

    func notifyCurrentBridgeAppResumed() {
        currentBridgeVC?.notifyAppResumed()
    }

    /// Switch to a web tab; optionally SPA-navigate to a sub-route (deep links / push notifications).
    func switchToWebTab(_ logicalTab: String, route: String? = nil) {
        let (bridgeVC, idx) = tabIndex(for: logicalTab)
        selectedIndex = idx
        mapVC.setOverlayActive(false)
        if let route {
            bridgeVC.navigateTo(route, source: "deeplink")
        }
    }

    // MARK: - Private

    private var currentBridgeVC: WebTabBridgeViewController? {
        if selectedIndex == 0 { return mapBridgeVC }
        return selectedViewController as? WebTabBridgeViewController
    }

    private func tabIndex(for logicalTab: String) -> (WebTabBridgeViewController, Int) {
        switch logicalTab {
        case "profile": return (profileBridgeVC, 2)
        case "admin":
            if isAdminVisible, let vc = adminBridgeVC { return (vc, 3) }
            return (profileBridgeVC, 2)
        default:        return (inboxBridgeVC, 1)
        }
    }

    private func rebuildTabs() {
        var vcs: [UIViewController] = [mapVC, inboxBridgeVC, profileBridgeVC]
        if isAdminVisible, let vc = adminBridgeVC { vcs.append(vc) }
        viewControllers = vcs
    }

    @objc private func handleRoleChange(_ note: Notification) {
        dispatchPrecondition(condition: .onQueue(.main))
        let isAdmin = (note.userInfo?["isAdmin"] as? Bool) ?? false
        guard isAdmin != isAdminVisible else { return }

        if isAdmin && adminBridgeVC == nil {
            let vc = WebTabBridgeViewController(route: "/admin", transparent: false)
            vc.tabBarItem = adminItem
            _ = vc.view
            adminBridgeVC = vc
        }

        isAdminVisible = isAdmin
        let previousIndex = selectedIndex
        rebuildTabs()
        if previousIndex < (viewControllers?.count ?? 0) {
            selectedIndex = previousIndex
        }

        if !isAdmin {
            adminBridgeVC = nil
        }
    }
}

// MARK: - UITabBarControllerDelegate

extension RootTabBarController: UITabBarControllerDelegate {
    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        let isMap = viewController === mapVC
        mapVC.setOverlayActive(isMap)
        applyTabBarAppearance(transparent: isMap)
    }

    private func applyTabBarAppearance(transparent: Bool) {
        let appearance = UITabBarAppearance()
        if transparent {
            appearance.configureWithTransparentBackground()
        } else {
            appearance.configureWithOpaqueBackground()
        }
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
    }
}

// MARK: - Notification names

extension Notification.Name {
    static let peekPokeRoleChanged         = Notification.Name("peekPokeRoleChanged")
    static let peekPokeAuthTokenChanged    = Notification.Name("peekPokeAuthTokenChanged")
    static let peekPokeMapInteractiveRects = Notification.Name("peekPokeMapInteractiveRects")
    // Web → Native: bridge sends pin data / camera commands
    static let peekPokeMapPins             = Notification.Name("peekPokeMapPins")
    static let peekPokeMapCamera           = Notification.Name("peekPokeMapCamera")
    // Native → Web: native map emits camera position and pin tap events
    static let peekPokeMapCameraDidChange  = Notification.Name("peekPokeMapCameraDidChange")
    static let peekPokeMapPinTapped        = Notification.Name("peekPokeMapPinTapped")
}
