import UIKit
import MapboxMaps

/// Root view that lets touches over transparent areas of the overlay WebView
/// pass through to the native MapView underneath. The web side publishes rects
/// of its floating UI (search bar, pills, recenter button, swiper) via
/// PeekPokeBridge.setMapInteractiveRects; touches outside those rects skip the
/// WebView and hit the map directly.
/// Coord space note: getBoundingClientRect() returns CSS-px doc coords; these
/// match this view's coord space only because capacitor.config has
/// contentInset:"never" so the WebView fills the view with no offset.
final class MapPassthroughView: UIView {
    weak var mapView: UIView?
    var interactiveRects: [CGRect] = []
    var passthroughEnabled: Bool = false

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard passthroughEnabled, let map = mapView else {
            return super.hitTest(point, with: event)
        }
        if interactiveRects.contains(where: { $0.contains(point) }) {
            return super.hitTest(point, with: event)
        }
        let mp = map.convert(point, from: self)
        return map.hitTest(mp, with: event) ?? map
    }
}

final class MapTabViewController: UIViewController {

    private var mapView: MapView!
    private var passthroughView: MapPassthroughView { view as! MapPassthroughView }

    override func loadView() {
        view = MapPassthroughView()
        view.backgroundColor = .black
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInteractiveRects(_:)),
            name: .peekPokeMapInteractiveRects,
            object: nil
        )
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard mapView == nil else { return }

        let mapInitOptions = MapInitOptions(
            cameraOptions: CameraOptions(
                center: CLLocationCoordinate2D(latitude: 42.6977, longitude: 23.3219),
                zoom: 14
            ),
            styleURI: .standard
        )
        let mv = MapView(frame: view.bounds, mapInitOptions: mapInitOptions)
        mv.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(mv)
        NSLayoutConstraint.activate([
            mv.topAnchor.constraint(equalTo: view.topAnchor),
            mv.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            mv.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mv.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        mapView = mv
        passthroughView.mapView = mv
    }

    /// Called by RootTabBarController when the map tab becomes/stops being the active overlay.
    func setOverlayActive(_ active: Bool) {
        if !active {
            passthroughView.passthroughEnabled = false
            passthroughView.interactiveRects = []
        }
        // When active, passthrough flips to true only after the first rects publish
        // from the web side, so the search bar still captures taps during the brief
        // boot window where rects = [].
    }

    @objc private func handleInteractiveRects(_ note: Notification) {
        guard let rects = note.userInfo?["rects"] as? [CGRect] else { return }
        passthroughView.interactiveRects = rects
        passthroughView.passthroughEnabled = true
    }
}
