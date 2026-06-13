import UIKit
import MapboxMaps
import Combine

/// Root view that lets touches over transparent areas of the overlay WebView
/// pass through to the native MapView underneath. The web side publishes rects
/// of its floating UI (search bar, pills, recenter button, swiper) via
/// PeekPokeBridge.setMapInteractiveRects; touches outside those rects skip the
/// WebView and hit the map directly.
/// Coord space note: getBoundingClientRect() returns CSS-px relative to the
/// WebView's own frame origin, not the screen. overlayView is used to convert
/// touch points into the WebView's coordinate space before comparing with rects.
final class MapPassthroughView: UIView {
    weak var mapView: UIView?
    weak var overlayView: UIView?
    var interactiveRects: [CGRect] = []
    var passthroughEnabled: Bool = false

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard passthroughEnabled, let map = mapView else {
            return super.hitTest(point, with: event)
        }
        // Convert touch point into the overlay's coordinate space so that
        // interactiveRects (CSS-px from getBoundingClientRect) match correctly
        // even when the WebView frame is offset below the safe area.
        let overlayPoint = overlayView.map { convert(point, to: $0) } ?? point
        if interactiveRects.contains(where: { $0.contains(overlayPoint) }) {
            return super.hitTest(point, with: event)
        }
        let mp = map.convert(point, from: self)
        return map.hitTest(mp, with: event) ?? map
    }
}

final class MapTabViewController: UIViewController {

    private var mapView: MapView!
    private var passthroughView: MapPassthroughView { view as! MapPassthroughView }
    private var overlayBridgeVC: MainBridgeViewController?

    // Annotation management
    private var annotationManager: PointAnnotationManager?
    private var currentPins: [String: MapPinData] = [:]          // id → current pin data
    private var builtAnnotations: [String: PointAnnotation] = [:]  // id → built annotation (for diffing)
    private var cancellables = Set<AnyCancellable>()
    private var cameraDebounceTimer: Timer?
    private var styleManager: MapboxStyleManager?

    // Map-tap handling: annotation taps also reach onMapTap in some gesture
    // orderings — suppress the empty-map tap event around an annotation tap.
    private var lastAnnotationTapAt: Date = .distantPast

    // Orbit (highlighted user): slow bearing rotation matching web MapView.tsx
    private var orbitLink: CADisplayLink?

    override func loadView() {
        view = MapPassthroughView()
        // Light app background (not .systemBackground, which goes black in dark
        // mode) — shows through the non-opaque WebView wherever web hasn't painted.
        view.backgroundColor = UIColor(red: 0.975, green: 0.974, blue: 0.977, alpha: 1)
    }

    func embedBridgeVC(_ bridgeVC: MainBridgeViewController) {
        overlayBridgeVC = bridgeVC
        addChild(bridgeVC)
        bridgeVC.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridgeVC.view)
        bridgeVC.didMove(toParent: self)
        passthroughView.overlayView = bridgeVC.view
        // Full bounds: the WebView is transparent on the map route (raw map shows
        // through the status bar area) and web CSS keeps content inside safe areas.
        NSLayoutConstraint.activate([
            bridgeVC.view.topAnchor.constraint(equalTo: view.topAnchor),
            bridgeVC.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridgeVC.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bridgeVC.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleInteractiveRects(_:)),
            name: .peekPokeMapInteractiveRects, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleMapPins(_:)),
            name: .peekPokeMapPins, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleMapCamera(_:)),
            name: .peekPokeMapCamera, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleMapOrbit(_:)),
            name: .peekPokeMapOrbit, object: nil
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

        // Remove built-in ornaments — scale bar and compass are replaced by web UI
        var ornamentOptions = mv.ornaments.options
        ornamentOptions.scaleBar.visibility = .hidden
        ornamentOptions.compass.visibility = .hidden
        mv.ornaments.options = ornamentOptions

        view.addSubview(mv)
        NSLayoutConstraint.activate([
            mv.topAnchor.constraint(equalTo: view.topAnchor),
            mv.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            mv.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mv.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        mapView = mv
        passthroughView.mapView = mv
        // Keep the transparent WebView overlay above the newly-added MapView
        if let overlay = overlayBridgeVC {
            view.bringSubviewToFront(overlay.view)
        }

        // Match web MapView.tsx: minZoom 16 keeps the map a local, street-level view
        try? mv.mapboxMap.setCameraBounds(with: CameraBoundsOptions(minZoom: 16))

        // Time-of-day light preset (dawn/day/dusk/night), reapplied on foreground
        styleManager = MapboxStyleManager(mapView: mv)

        // Create annotation manager for user/bot pins
        let mgr = mv.annotations.makePointAnnotationManager()
        mgr.iconAllowOverlap = true
        mgr.iconIgnorePlacement = true
        annotationManager = mgr

        // Tap handler: emit mapPinTapped to web
        mgr.delegate = self

        // Emit camera state when map becomes idle (pan/zoom ended)
        mv.mapboxMap.onMapIdle.observe { [weak self] _ in
            self?.emitCameraChanged(isUserGesture: true)
        }.store(in: &cancellables)

        // Empty-map taps clear web selections (web MapView onClick parity)
        mv.gestures.onMapTap.observe { [weak self] _ in
            self?.handleMapTap()
        }.store(in: &cancellables)

        // Any user gesture cancels an active orbit (web parity: drag stops orbit)
        mv.gestures.delegate = self
    }

    /// Called by RootShellViewController when the map tab becomes/stops being the active overlay.
    func setOverlayActive(_ active: Bool) {
        // Keep the previously-published interactiveRects on deactivation. The
        // persistent WebView's DOM doesn't change while another tab is showing,
        // so its ResizeObserver/MutationObserver won't refire on return — clearing
        // rects would leave passthrough permanently disabled until the user
        // navigated within the web app. Cached rects stay valid for the same DOM.
        passthroughView.passthroughEnabled = active && !passthroughView.interactiveRects.isEmpty
        // Stop Mapbox from drawing while another tab is showing — otherwise its
        // layer can bleed through opaque web tabs at the status bar and home
        // indicator edges depending on the iOS compositor state.
        mapView?.isHidden = !active
        if !active { stopOrbit() }
    }

    private func handleMapTap() {
        // Annotation taps can surface through onMapTap as well; the suppression
        // window keeps a pin tap from also emitting an empty-map tap.
        guard Date().timeIntervalSince(lastAnnotationTapAt) > 0.3 else { return }
        NotificationCenter.default.post(name: .peekPokeMapTapped, object: nil)
    }

    @objc private func handleInteractiveRects(_ note: Notification) {
        guard let rects = note.userInfo?["rects"] as? [CGRect] else { return }
        passthroughView.interactiveRects = rects
        passthroughView.passthroughEnabled = true
    }

    // MARK: - Pin data handler

    @objc private func handleMapPins(_ note: Notification) {
        guard let rawPins = note.userInfo?["pins"] as? [[String: Any]] else { return }
        let pins = rawPins.compactMap { MapPinData.from(dict: $0) }
        applyPins(pins)
    }

    private func applyPins(_ pins: [MapPinData]) {
        guard let mgr = annotationManager else { return }

        let newPinsById = Dictionary(uniqueKeysWithValues: pins.map { ($0.id, $0) })

        // Skip entirely if the pin set is unchanged
        guard newPinsById != currentPins else { return }

        let previousPins = currentPins
        currentPins = newPinsById

        var annotations: [PointAnnotation] = []
        var newBuilt: [String: PointAnnotation] = [:]

        for pin in pins {
            // Reuse existing annotation if pin data is identical (no visual or position change)
            if previousPins[pin.id] == pin, let existing = builtAnnotations[pin.id] {
                annotations.append(existing)
                newBuilt[pin.id] = existing
                continue
            }

            let coord = CLLocationCoordinate2D(latitude: pin.lat, longitude: pin.lng)
            var annotation = PointAnnotation(id: pin.id, coordinate: coord)
            let img = MapPinRenderer.shared.image(for: pin) { [weak self] pinId, updatedImg in
                self?.updateAnnotationImage(id: pinId, image: updatedImg)
            }
            annotation.image = .init(image: img, name: "\(pin.id)_\(pin.kind)_\(pin.isOnline)_\(pin.collectable)_\(pin.isSelected)")
            annotation.iconAnchor = .center
            annotations.append(annotation)
            newBuilt[pin.id] = annotation
        }

        builtAnnotations = newBuilt
        mgr.annotations = annotations
    }

    private func updateAnnotationImage(id: String, image: UIImage) {
        guard let mgr = annotationManager,
              let pin = currentPins[id],
              let idx = mgr.annotations.firstIndex(where: { $0.id == id }) else { return }
        var anns = mgr.annotations
        anns[idx].image = .init(image: image, name: "\(id)_\(pin.kind)_\(pin.isOnline)_\(pin.collectable)_\(pin.isSelected)_av")
        mgr.annotations = anns
    }

    // MARK: - Camera handler

    @objc private func handleMapCamera(_ note: Notification) {
        stopOrbit()
        guard let info = note.userInfo as? [String: Any],
              let lat      = info["lat"]      as? Double,
              let lng      = info["lng"]      as? Double,
              let zoom     = info["zoom"]     as? Double else { return }
        let bearing  = info["bearing"]   as? Double ?? 0
        let pitch    = info["pitch"]     as? Double ?? 0
        let animated = info["animated"]  as? Bool ?? true
        let duration = info["durationMs"] as? Double ?? 500

        let camera = CameraOptions(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            padding: nil,
            anchor: nil,
            zoom: CGFloat(zoom),
            bearing: bearing,
            pitch: CGFloat(pitch)
        )
        if animated {
            mapView?.camera.fly(to: camera, duration: duration / 1000)
        } else {
            mapView?.mapboxMap.setCamera(to: camera)
        }
        // Emit updated camera so web can recompute clusters
        DispatchQueue.main.asyncAfter(deadline: .now() + (animated ? duration / 1000 + 0.05 : 0.05)) {
            self.emitCameraChanged(isUserGesture: false)
        }
    }

    // MARK: - Orbit (highlighted user)

    @objc private func handleMapOrbit(_ note: Notification) {
        let active = note.userInfo?["active"] as? Bool ?? false
        if active { startOrbit() } else { stopOrbit() }
    }

    private func startOrbit() {
        stopOrbit()
        let link = CADisplayLink(target: self, selector: #selector(orbitTick(_:)))
        link.add(to: .main, forMode: .common)
        orbitLink = link
    }

    private func stopOrbit() {
        orbitLink?.invalidate()
        orbitLink = nil
    }

    @objc private func orbitTick(_ link: CADisplayLink) {
        guard let map = mapView?.mapboxMap else { return }
        // 360° per 60 s — same speed as web MapView.tsx's orbit animation
        let bearing = map.cameraState.bearing + (360.0 / 60.0) * link.duration
        map.setCamera(to: CameraOptions(bearing: bearing))
    }

    // MARK: - Camera event emission

    private func emitCameraChanged(isUserGesture: Bool) {
        guard let mapView, let map = mapView.mapboxMap else { return }
        let state = map.cameraState

        let cameraOptions = CameraOptions(
            center: state.center,
            zoom: state.zoom,
            bearing: state.bearing,
            pitch: state.pitch
        )
        let bounds = map.coordinateBounds(for: cameraOptions)

        NotificationCenter.default.post(
            name: .peekPokeMapCameraDidChange,
            object: nil,
            userInfo: [
                "lat":           state.center.latitude,
                "lng":           state.center.longitude,
                "zoom":          Double(state.zoom),
                "bearing":       state.bearing,
                "pitch":         Double(state.pitch),
                "isUserGesture": isUserGesture,
                // [west, south, east, north] — matches MapCameraChangedEvent.bounds in TS
                "bounds": [
                    bounds.southwest.longitude,
                    bounds.southwest.latitude,
                    bounds.northeast.longitude,
                    bounds.northeast.latitude,
                ],
            ]
        )
    }
}

// MARK: - Annotation tap delegate

extension MapTabViewController: GestureManagerDelegate {
    func gestureManager(_ gestureManager: GestureManager, didBegin gestureType: GestureType) {
        stopOrbit()
    }
    func gestureManager(_ gestureManager: GestureManager, didEnd gestureType: GestureType, willAnimate: Bool) {}
    func gestureManager(_ gestureManager: GestureManager, didEndAnimatingFor gestureType: GestureType) {}
}

extension MapTabViewController: AnnotationInteractionDelegate {
    func annotationManager(_ manager: AnnotationManager, didDetectTappedAnnotations annotations: [Annotation]) {
        guard let annotation = annotations.first as? PointAnnotation,
              let pin = currentPins[annotation.id] else { return }
        lastAnnotationTapAt = Date()

        var info: [String: Any] = ["id": pin.id, "kind": pin.kind]
        if pin.kind == "cluster" {
            info["childIds"] = pin.childIds
        }
        NotificationCenter.default.post(name: .peekPokeMapPinTapped, object: nil, userInfo: info)
    }
}
