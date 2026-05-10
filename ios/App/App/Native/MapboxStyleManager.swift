import Foundation
import UIKit
import MapboxMaps

/// Decides which Mapbox Standard light preset to use based on the local hour,
/// matching the web app's behavior in MapView.tsx.
enum MapboxLightPreset: String {
    case dawn, day, dusk, night

    static var forCurrentHour: MapboxLightPreset {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<8: return .dawn
        case 8..<19: return .day
        case 19..<21: return .dusk
        default: return .night
        }
    }
}

final class MapboxStyleManager {
    private weak var mapView: MapView?
    private var didApplyInitialPreset = false

    init(mapView: MapView) {
        self.mapView = mapView
        mapView.mapboxMap.styleURI = StyleURI(rawValue: "mapbox://styles/mapbox/standard")

        mapView.mapboxMap.onStyleLoaded.observeNext { [weak self] _ in
            self?.applyLightPreset()
        }.store(in: &tokens)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleForeground),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    private var tokens: [AnyCancelable] = []

    @objc private func handleForeground() {
        applyLightPreset()
    }

    func applyLightPreset() {
        guard let mapView else { return }
        let preset = MapboxLightPreset.forCurrentHour.rawValue
        do {
            try mapView.mapboxMap.setStyleImportConfigProperty(
                for: "basemap",
                config: "lightPreset",
                value: preset
            )
            didApplyInitialPreset = true
        } catch {
            #if DEBUG
            print("[MapboxStyleManager] failed to set lightPreset=\(preset): \(error)")
            #endif
        }
    }
}
