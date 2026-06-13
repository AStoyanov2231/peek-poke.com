import UIKit
import Combine
#if DEBUG
import Network
import WebKit
#endif

/// Permanent root shell: native Mapbox map at the bottom, ONE persistent WebView
/// above it, native UITabBar on top. Tab taps SPA-navigate the WebView via the
/// `navigate` bridge event — nothing is reloaded or torn down on a switch, so all
/// in-memory web state (React Query cache, Zustand, scroll, session) survives.
///
/// The web layer reports route changes back via PeekPokeBridge.setActiveRoute so
/// tab selection, map visibility, bar appearance, and bar visibility (login vs.
/// signed-in) stay in sync. Auth flips only show/hide the tab bar — the WebView
/// is never destroyed.
final class RootShellViewController: UIViewController {

    let bridgeVC = MainBridgeViewController()
    private let mapVC = MapTabViewController()
    private let tabBar = UITabBar()

    private let mapItem     = UITabBarItem(title: "Map",   image: UIImage(systemName: "map"),      tag: 0)
    private let inboxItem   = UITabBarItem(title: "Inbox", image: UIImage(systemName: "envelope"), tag: 1)
    private let profileItem = UITabBarItem(title: "Me",    image: UIImage(systemName: "person"),   tag: 2)
    private let adminItem   = UITabBarItem(title: "Admin", image: UIImage(systemName: "shield"),   tag: 3)

    private var isAdminVisible = false
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        // Matches the web app background — shows through wherever the non-opaque
        // WebView hasn't painted (e.g. during the initial load) instead of black.
        view.backgroundColor = UIColor(red: 0.975, green: 0.974, blue: 0.977, alpha: 1)

        // Map layer with the single WebView embedded above it (full bounds;
        // web CSS handles safe areas via env() + the is-native class).
        addChild(mapVC)
        mapVC.view.frame = view.bounds
        mapVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(mapVC.view)
        mapVC.didMove(toParent: self)
        mapVC.embedBridgeVC(bridgeVC)

        tabBar.delegate = self
        rebuildTabs()
        tabBar.selectedItem = mapItem
        view.addSubview(tabBar)

        applyTabBarAppearance(transparent: true)
        mapVC.setOverlayActive(true)

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleRoleChange(_:)),
            name: .peekPokeRoleChanged, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleActiveRouteChange(_:)),
            name: .peekPokeActiveRouteChanged, object: nil
        )

        // The tab bar only makes sense signed-in; signed out, the WebView shows
        // /login on its own (middleware redirect). Crucially the WebView itself
        // is NEVER torn down on auth changes.
        AuthStore.shared.$isAuthenticated
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isAuth in
                self?.setTabBarVisible(isAuth)
            }
            .store(in: &cancellables)

        #if DEBUG
        DebugCommandServer.shared.start(shell: self)
        #endif
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let barHeight = tabBar.sizeThatFits(view.bounds.size).height
        let totalHeight = barHeight + view.safeAreaInsets.bottom
        tabBar.frame = CGRect(
            x: 0,
            y: view.bounds.height - totalHeight,
            width: view.bounds.width,
            height: totalHeight
        )
        updateWebInsets()
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
        bridgeVC.notifyAppResumed()
    }

    #if DEBUG
    /// Automation hook (peekpoke://tab/<name>) — same code path as a user tab tap.
    func debugSelectTab(_ name: String) {
        let item: UITabBarItem
        switch name {
        case "inbox":   item = inboxItem
        case "profile": item = profileItem
        case "admin":   item = adminItem
        default:        item = mapItem
        }
        tabBar.selectedItem = item
        self.tabBar(tabBar, didSelect: item)
    }
    #endif

    // MARK: - Private

    private func route(for item: UITabBarItem) -> String {
        switch item {
        case inboxItem:   return "/inbox"
        case profileItem: return "/profile"
        case adminItem:   return "/admin"
        default:          return "/"
        }
    }

    /// Maps a web route back to the tab that owns it. Chat belongs to inbox;
    /// routes outside any section (login, onboarding) return nil and leave the
    /// current selection unchanged.
    private func tabItem(for route: String) -> UITabBarItem? {
        if route == "/" { return mapItem }
        if route == "/inbox" || route.hasPrefix("/inbox/") || route.hasPrefix("/inbox?")
            || route == "/chat" || route.hasPrefix("/chat/") { return inboxItem }
        if route == "/profile" || route.hasPrefix("/profile/") { return profileItem }
        if route == "/admin" || route.hasPrefix("/admin/") { return adminItem }
        return nil
    }

    private func setTabBarVisible(_ visible: Bool) {
        guard tabBar.isHidden == visible else { return }
        tabBar.isHidden = !visible
        updateWebInsets()
    }

    /// Mimic UITabBarController behavior: the web layer sees the tab bar height in
    /// env(safe-area-inset-bottom) so content clears the bar on every section.
    private func updateWebInsets() {
        let barHeight = tabBar.isHidden ? 0 : tabBar.sizeThatFits(view.bounds.size).height
        if bridgeVC.additionalSafeAreaInsets.bottom != barHeight {
            bridgeVC.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 0, bottom: barHeight, right: 0)
        }
    }

    private func rebuildTabs() {
        var items = [mapItem, inboxItem, profileItem]
        if isAdminVisible { items.append(adminItem) }
        tabBar.items = items
    }

    private func applyMapState(isMap: Bool) {
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

    // MARK: - Notifications

    /// Web reported a client-side route change (tab tap echo, deep link, in-web nav).
    @objc private func handleActiveRouteChange(_ note: Notification) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard let route = note.userInfo?["route"] as? String else { return }
        if let item = tabItem(for: route) {
            tabBar.selectedItem = item
        }
        applyMapState(isMap: route == "/")
    }

    @objc private func handleRoleChange(_ note: Notification) {
        dispatchPrecondition(condition: .onQueue(.main))
        let isAdmin = (note.userInfo?["isAdmin"] as? Bool) ?? false
        guard isAdmin != isAdminVisible else { return }

        let wasOnAdmin = tabBar.selectedItem === adminItem
        isAdminVisible = isAdmin
        rebuildTabs()

        if !isAdmin && wasOnAdmin {
            tabBar.selectedItem = profileItem
            bridgeVC.navigateTo("/profile")
            applyMapState(isMap: false)
        }
    }
}

// MARK: - UITabBarDelegate

extension RootShellViewController: UITabBarDelegate {
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let target = route(for: item)
        // Apply map/appearance optimistically; the web echoes back via
        // setActiveRoute once the SPA navigation lands (idempotent).
        applyMapState(isMap: item === mapItem)
        bridgeVC.navigateTo(target, source: "tab")
    }
}

#if DEBUG
/// Simulator/dev automation channel (never compiled into release builds).
/// The simulator shares the host loopback, so from the Mac:
///   printf 'tab inbox'        | nc 127.0.0.1 7766   — same code path as a tab tap
///   printf 'auth <at> <rt>'   | nc 127.0.0.1 7766   — seed Keychain like a sign-in
///   printf 'clearauth'        | nc 127.0.0.1 7766
///   printf 'js <expression>'  | nc 127.0.0.1 7766   — evaluate JS in the WebView, returns result
final class DebugCommandServer {
    static let shared = DebugCommandServer()
    private var listener: NWListener?
    private weak var shell: RootShellViewController?

    func start(shell: RootShellViewController) {
        self.shell = shell
        guard listener == nil, let l = try? NWListener(using: .tcp, on: 7766) else { return }
        l.newConnectionHandler = { [weak self] conn in
            conn.start(queue: .main)
            conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, _, _ in
                guard let data, let cmd = String(data: data, encoding: .utf8) else {
                    conn.cancel()
                    return
                }
                self?.handle(cmd.trimmingCharacters(in: .whitespacesAndNewlines)) { reply in
                    conn.send(
                        content: (reply + "\n").data(using: .utf8),
                        completion: .contentProcessed { _ in conn.cancel() }
                    )
                }
            }
        }
        l.start(queue: .main)
        listener = l
    }

    private func handle(_ cmd: String, reply: @escaping (String) -> Void) {
        if cmd.hasPrefix("js ") {
            let source = String(cmd.dropFirst(3))
            shell?.bridgeVC.webView?.evaluateJavaScript(source) { result, error in
                if let error { reply("error: \(error.localizedDescription)") }
                else { reply("\(result ?? "undefined")") }
            }
            return
        }
        let parts = cmd.split(separator: " ").map(String.init)
        switch parts.first {
        case "tab" where parts.count > 1:
            shell?.debugSelectTab(parts[1])
            reply("ok")
        case "auth" where parts.count > 2:
            AuthStore.shared.update(AuthSession(accessToken: parts[1], refreshToken: parts[2], expiresAt: nil))
            reply("ok")
        case "clearauth":
            AuthStore.shared.clear()
            reply("ok")
        default:
            reply("unknown command")
        }
    }
}
#endif

// MARK: - Notification names

extension Notification.Name {
    static let peekPokeRoleChanged         = Notification.Name("peekPokeRoleChanged")
    static let peekPokeAuthTokenChanged    = Notification.Name("peekPokeAuthTokenChanged")
    static let peekPokeActiveRouteChanged  = Notification.Name("peekPokeActiveRouteChanged")
    static let peekPokeMapInteractiveRects = Notification.Name("peekPokeMapInteractiveRects")
    // Web → Native: bridge sends pin data / camera commands
    static let peekPokeMapPins             = Notification.Name("peekPokeMapPins")
    static let peekPokeMapCamera           = Notification.Name("peekPokeMapCamera")
    static let peekPokeMapOrbit            = Notification.Name("peekPokeMapOrbit")
    // Native → Web: native map emits camera position and tap events
    static let peekPokeMapCameraDidChange  = Notification.Name("peekPokeMapCameraDidChange")
    static let peekPokeMapPinTapped        = Notification.Name("peekPokeMapPinTapped")
    static let peekPokeMapTapped           = Notification.Name("peekPokeMapTapped")
    // Native → Web: peekpoke:// OAuth callback URL from the system browser
    static let peekPokeOAuthCallback       = Notification.Name("peekPokeOAuthCallback")
}
