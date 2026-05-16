import UIKit

// MARK: - Pin data model

struct MapPinData: Equatable {
    let id: String
    let lat: Double
    let lng: Double
    let kind: String   // "self" | "user" | "friend" | "bot" | "highlighted" | "cluster"
    let avatarUrl: String?
    let initial: String
    let colorIndex: Int
    let isOnline: Bool
    let isPending: Bool
    let count: Int         // cluster count (0 for non-cluster)
    let childIds: [String] // cluster children (empty for non-cluster)
}

// MARK: - Color palette (mirrors web avatarColor palette & NativeMapBridge.pinColorIndex)

private struct PinColor {
    let bg: UIColor
    let fg: UIColor
}

private let PIN_PALETTE: [PinColor] = [
    PinColor(bg: UIColor(hex: "#C6B4EE"), fg: UIColor(hex: "#3C248C")), // 0 purple
    PinColor(bg: UIColor(hex: "#F0D2BE"), fg: UIColor(hex: "#945530")), // 1 peach
    PinColor(bg: UIColor(hex: "#AAE6C8"), fg: UIColor(hex: "#287650")), // 2 mint
    PinColor(bg: UIColor(hex: "#B9D7F0"), fg: UIColor(hex: "#1E588C")), // 3 sky
    PinColor(bg: UIColor(hex: "#EEB9DA"), fg: UIColor(hex: "#942A64")), // 4 pink
    PinColor(bg: UIColor(hex: "#DCEBB4"), fg: UIColor(hex: "#697628")), // 5 yellow-green
]

private let SELF_COLOR     = PinColor(bg: UIColor(hex: "#4F8FFF"), fg: .white)
private let CLUSTER_COLOR  = PinColor(bg: UIColor(hex: "#E5E7EB"), fg: UIColor(hex: "#374151"))
private let HIGHLIGHTED_RING = UIColor(hex: "#4F8FFF")
private let FRIEND_RING      = UIColor.white
private let PENDING_RING     = UIColor(hex: "#94A3B8")
private let ONLINE_DOT       = UIColor(hex: "#22C55E")

// MARK: - Image renderer

/// Generates and caches UIImages for map pins; fetches avatar URLs asynchronously.
final class MapPinRenderer {
    static let shared = MapPinRenderer()
    private init() {}

    private var imageCache:   [String: UIImage] = [:]  // key = cacheKey(pin)
    private var avatarCache:  [String: UIImage] = [:]  // key = avatarUrl
    private var pendingFetch: Set<String> = []

    // Returns a synchronous placeholder image. If the pin has an avatar URL
    // that hasn't been downloaded yet, kicks off a fetch and calls `onUpdate`
    // with the final image when it lands.
    func image(for pin: MapPinData, onUpdate: @escaping (String, UIImage) -> Void) -> UIImage {
        let key = cacheKey(for: pin)
        if let cached = imageCache[key] { return cached }

        let placeholder = render(pin: pin, avatar: nil)
        imageCache[key] = placeholder

        guard let urlStr = pin.avatarUrl, !urlStr.isEmpty,
              let url = URL(string: urlStr) else {
            return placeholder
        }

        // Already have avatar cached
        if let av = avatarCache[urlStr] {
            let img = render(pin: pin, avatar: av)
            imageCache[key] = img
            return img
        }

        guard !pendingFetch.contains(urlStr) else { return placeholder }
        pendingFetch.insert(urlStr)
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let uiImg = UIImage(data: data) else {
                self?.pendingFetch.remove(urlStr)
                return
            }
            DispatchQueue.main.async {
                self.pendingFetch.remove(urlStr)
                self.avatarCache[urlStr] = uiImg
                // Invalidate all cached keys that used this URL
                self.imageCache = self.imageCache.filter { $0.key.contains(urlStr) == false }
                let updated = self.render(pin: pin, avatar: uiImg)
                self.imageCache[key] = updated
                onUpdate(pin.id, updated)
            }
        }.resume()

        return placeholder
    }

    func invalidate(id: String) {
        imageCache = imageCache.filter { !$0.key.hasPrefix(id + "|") }
    }

    // MARK: - Private rendering

    private func cacheKey(for pin: MapPinData) -> String {
        "\(pin.id)|\(pin.kind)|\(pin.colorIndex)|\(pin.isOnline)|\(pin.isPending)|\(pin.avatarUrl ?? "")"
    }

    private func render(pin: MapPinData, avatar: UIImage?) -> UIImage {
        switch pin.kind {
        case "cluster":
            return renderCluster(count: pin.count, initial: pin.initial)
        case "self":
            return renderUser(pin: pin, avatar: avatar, color: SELF_COLOR, size: 52, ringColor: nil)
        case "highlighted":
            return renderUser(pin: pin, avatar: avatar, color: palette(pin), size: 50, ringColor: HIGHLIGHTED_RING)
        case "friend":
            let ring: UIColor = pin.isPending ? PENDING_RING : FRIEND_RING
            return renderUser(pin: pin, avatar: avatar, color: palette(pin), size: 44, ringColor: ring)
        case "bot":
            return renderBot()
        default:
            return renderUser(pin: pin, avatar: avatar, color: palette(pin), size: 40, ringColor: nil)
        }
    }

    private func palette(_ pin: MapPinData) -> PinColor {
        PIN_PALETTE[max(0, min(pin.colorIndex, PIN_PALETTE.count - 1))]
    }

    private func renderUser(pin: MapPinData, avatar: UIImage?, color: PinColor, size: CGFloat, ringColor: UIColor?) -> UIImage {
        let hasRing = ringColor != nil
        let ringWidth: CGFloat = hasRing ? 2.5 : 0
        let padding: CGFloat = hasRing ? 3 : 0
        let total = size + padding * 2

        return UIGraphicsImageRenderer(size: CGSize(width: total, height: total)).image { _ in
            let center = CGPoint(x: total / 2, y: total / 2)
            let radius = size / 2

            // Ring
            if let ring = ringColor {
                ring.setStroke()
                let path = UIBezierPath(arcCenter: center, radius: radius + padding - ringWidth / 2,
                                       startAngle: 0, endAngle: .pi * 2, clockwise: true)
                path.lineWidth = ringWidth
                path.stroke()
            }

            // Background circle
            let circlePath = UIBezierPath(arcCenter: center, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: true)
            color.bg.setFill()
            circlePath.fill()

            // Avatar image (clipped to circle)
            if let av = avatar {
                let rect = CGRect(x: center.x - radius, y: center.y - radius, width: size, height: size)
                circlePath.addClip()
                av.draw(in: rect)
            } else {
                // Initial letter
                let fontSize = size * 0.42
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.boldSystemFont(ofSize: fontSize),
                    .foregroundColor: color.fg,
                ]
                let str = NSAttributedString(string: pin.initial, attributes: attrs)
                let strSize = str.size()
                str.draw(at: CGPoint(x: center.x - strSize.width / 2, y: center.y - strSize.height / 2))
            }

            // Online dot
            if pin.isOnline {
                let dotDiameter: CGFloat = total * 0.22
                let dotX = center.x + radius * cos(.pi / 4) - dotDiameter / 2
                let dotY = center.y + radius * sin(.pi / 4) - dotDiameter / 2
                UIColor.white.setFill()
                UIBezierPath(ovalIn: CGRect(x: dotX - 1.5, y: dotY - 1.5, width: dotDiameter + 3, height: dotDiameter + 3)).fill()
                ONLINE_DOT.setFill()
                UIBezierPath(ovalIn: CGRect(x: dotX, y: dotY, width: dotDiameter, height: dotDiameter)).fill()
            }
        }
    }

    private func renderCluster(count: Int, initial: String) -> UIImage {
        let size: CGFloat = count > 20 ? 52 : count > 5 ? 46 : 40
        return UIGraphicsImageRenderer(size: CGSize(width: size, height: size)).image { _ in
            let center = CGPoint(x: size / 2, y: size / 2)
            let radius = size / 2

            CLUSTER_COLOR.bg.setFill()
            UIBezierPath(arcCenter: center, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: true).fill()

            UIColor.white.withAlphaComponent(0.3).setStroke()
            let border = UIBezierPath(arcCenter: center, radius: radius - 1, startAngle: 0, endAngle: .pi * 2, clockwise: true)
            border.lineWidth = 2
            border.stroke()

            let fontSize = size * 0.36
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: fontSize),
                .foregroundColor: CLUSTER_COLOR.fg,
            ]
            let str = NSAttributedString(string: initial, attributes: attrs)
            let strSize = str.size()
            str.draw(at: CGPoint(x: center.x - strSize.width / 2, y: center.y - strSize.height / 2))
        }
    }

    private func renderBot() -> UIImage {
        let size: CGFloat = 38
        let color = PIN_PALETTE[5]
        return UIGraphicsImageRenderer(size: CGSize(width: size, height: size)).image { _ in
            let center = CGPoint(x: size / 2, y: size / 2)
            color.bg.setFill()
            UIBezierPath(arcCenter: center, radius: size / 2, startAngle: 0, endAngle: .pi * 2, clockwise: true).fill()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 18),
                .foregroundColor: color.fg,
            ]
            let str = NSAttributedString(string: "🤖", attributes: attrs)
            let strSize = str.size()
            str.draw(at: CGPoint(x: center.x - strSize.width / 2, y: center.y - strSize.height / 2))
        }
    }
}

// MARK: - UIColor hex initializer

extension UIColor {
    convenience init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s = String(s.dropFirst()) }
        var rgb: UInt64 = 0
        Scanner(string: s).scanHexInt64(&rgb)
        let r = CGFloat((rgb >> 16) & 0xFF) / 255
        let g = CGFloat((rgb >>  8) & 0xFF) / 255
        let b = CGFloat( rgb        & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: 1)
    }
}

// MARK: - Bridge JSON → MapPinData

extension MapPinData {
    static func from(dict: [String: Any]) -> MapPinData? {
        guard let id  = dict["id"]  as? String,
              let lat = dict["lat"] as? Double,
              let lng = dict["lng"] as? Double,
              let kind = dict["kind"] as? String else { return nil }
        return MapPinData(
            id:         id,
            lat:        lat,
            lng:        lng,
            kind:       kind,
            avatarUrl:  dict["avatarUrl"] as? String,
            initial:    dict["initial"]   as? String ?? "?",
            colorIndex: dict["colorIndex"] as? Int ?? 0,
            isOnline:   dict["isOnline"]   as? Bool ?? false,
            isPending:  dict["isPending"]  as? Bool ?? false,
            count:      dict["count"]      as? Int ?? 0,
            childIds:   dict["childIds"]  as? [String] ?? []
        )
    }
}
