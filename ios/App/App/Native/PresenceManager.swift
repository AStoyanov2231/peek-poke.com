import Foundation
import Combine
import CoreLocation
import Supabase

struct NearbyUser: Identifiable, Equatable {
    let userId: String
    let username: String
    let avatarURL: String?
    let displayName: String?
    let lat: Double
    let lng: Double

    var id: String { userId }
}

/// Subscribes to the `user-locations` Supabase Realtime presence channel,
/// tracks the current device's location into it, and publishes the list of
/// nearby peers within RADIUS_KM.
@MainActor
final class PresenceManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private static let radiusKm: Double = 2.0
    private static let trackDebounceMs: Int = 5_000

    @Published private(set) var nearby: [NearbyUser] = []
    @Published private(set) var ownLocation: CLLocationCoordinate2D?
    @Published private(set) var ownUserId: String?

    private let client = SupabaseService.shared.client
    private var channel: RealtimeChannelV2?
    private var presenceMap: [String: PresenceV2] = [:]
    private var presenceTask: Task<Void, Never>?
    private var authCancellable: AnyCancellable?
    private var lastTrackAt: Date = .distantPast

    private let locationManager = CLLocationManager()

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.distanceFilter = 25

        // React to token changes; (re)subscribe whenever auth becomes available.
        authCancellable = AuthStore.shared.$accessToken
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] token in
                guard let self else { return }
                Task { await self.applyAuth(token: token) }
            }
    }

    func start() {
        let status = locationManager.authorizationStatus
        if status == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else if status == .authorizedWhenInUse || status == .authorizedAlways {
            locationManager.startUpdatingLocation()
        }
    }

    func stop() {
        locationManager.stopUpdatingLocation()
        presenceTask?.cancel()
        if let channel {
            Task { await channel.unsubscribe() }
        }
        channel = nil
        presenceMap = [:]
    }

    private func applyAuth(token: String?) async {
        // If we lose token, drop the channel.
        if token == nil {
            presenceTask?.cancel()
            if let channel { await channel.unsubscribe() }
            channel = nil
            presenceMap = [:]
            ownUserId = nil
            nearby = []
            return
        }
        // Resolve own userId from the token-bearing session.
        do {
            let user = try await client.auth.user()
            ownUserId = user.id.uuidString.lowercased()
        } catch {
            return
        }
        await ensureChannel()
    }

    private func ensureChannel() async {
        guard let userId = ownUserId else { return }
        if channel != nil { return }

        let ch = client.channel("user-locations") {
            $0.presence.key = userId
        }
        self.channel = ch

        do {
            try await ch.subscribeWithError()
        } catch {
            #if DEBUG
            print("[Presence] subscribe failed: \(error)")
            #endif
            return
        }

        // Listen for presence sync and re-derive nearby list.
        presenceTask = Task { [weak self] in
            guard let self else { return }
            for await action in ch.presenceChange() {
                if Task.isCancelled { break }
                for (key, presence) in action.joins { self.presenceMap[key] = presence }
                for key in action.leaves.keys { self.presenceMap.removeValue(forKey: key) }
                self.recomputeNearby()
            }
        }

        // Track immediately if we already have a location.
        if let loc = ownLocation {
            await trackLocation(loc)
        }
    }

    private func recomputeNearby() {
        guard let me = ownLocation, let myId = ownUserId else { return }
        var result: [NearbyUser] = []
        for (key, presence) in presenceMap {
            if key == myId { continue }
            guard let dict = jsonToDict(presence.state) else { continue }
            guard let userId = dict["userId"] as? String,
                  let lat = dict["lat"] as? Double,
                  let lng = dict["lng"] as? Double else { continue }
            let distance = haversineKm(lat1: me.latitude, lon1: me.longitude, lat2: lat, lon2: lng)
            guard distance <= Self.radiusKm else { continue }
            result.append(NearbyUser(
                userId: userId,
                username: (dict["username"] as? String) ?? "",
                avatarURL: dict["avatar_url"] as? String,
                displayName: dict["display_name"] as? String,
                lat: lat,
                lng: lng
            ))
        }
        nearby = result
    }

    private func trackLocation(_ coord: CLLocationCoordinate2D) async {
        guard let channel, let userId = ownUserId else { return }
        let now = Date()
        if now.timeIntervalSince(lastTrackAt) * 1000 < Double(Self.trackDebounceMs) {
            return
        }
        lastTrackAt = now

        let payload: [String: AnyJSON] = [
            "userId": .string(userId),
            "username": .string(""),
            "avatar_url": .null,
            "display_name": .null,
            "lat": .double(coord.latitude),
            "lng": .double(coord.longitude),
        ]
        do {
            try await channel.track(payload)
        } catch {
            #if DEBUG
            print("[Presence] track failed: \(error)")
            #endif
        }
    }

    // MARK: CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        Task { @MainActor in
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                manager.startUpdatingLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        Task { @MainActor in
            self.ownLocation = last.coordinate
            await self.trackLocation(last.coordinate)
            self.recomputeNearby()
        }
    }

    // MARK: helpers

    private func jsonToDict(_ json: [String: AnyJSON]) -> [String: Any]? {
        var out: [String: Any] = [:]
        for (k, v) in json {
            switch v {
            case .string(let s): out[k] = s
            case .double(let d): out[k] = d
            case .integer(let i): out[k] = Double(i)
            case .bool(let b): out[k] = b
            case .null: continue
            case .array, .object: continue
            }
        }
        return out
    }

    private func haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let r = 6371.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLon = (lon2 - lon1) * .pi / 180
        let a = sin(dLat/2) * sin(dLat/2) +
                cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) *
                sin(dLon/2) * sin(dLon/2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }
}
