import Foundation

enum AppConfig {
    #if DEBUG
    static let webOrigin = "http://localhost:3000"
    #else
    static let webOrigin = "https://www.peek-poke.com"
    #endif

    static var mapboxAccessToken: String? {
        let value = info("MBXAccessToken")
        #if DEBUG
        if let value {
            print("[AppConfig] MBXAccessToken loaded: \(value.prefix(8))…\(value.suffix(4))")
        } else {
            print("[AppConfig] MBXAccessToken: NIL — Info.plist $(MBX_ACCESS_TOKEN) substitution failed")
        }
        #endif
        return value
    }

    private static func info(_ key: String) -> String? {
        guard let v = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        if v.hasPrefix("$(") { return nil }
        return v
    }
}
