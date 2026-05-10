import UIKit
import MapboxMaps

final class MapTabViewController: UIViewController {

    private var mapView: MapView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
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
    }
}
