import Foundation

enum AppConfig {
    #if DEBUG
    static let webOrigin = "http://localhost:3000"
    #else
    static let webOrigin = "https://www.peek-poke.com"
    #endif

    static var supabaseURL: URL {
        guard let raw = info("SupabaseURL"), let url = URL(string: raw) else {
            fatalError("SupabaseURL missing in Info.plist (set SUPABASE_URL build setting)")
        }
        return url
    }

    static var supabaseAnonKey: String {
        guard let raw = info("SupabaseAnonKey"), !raw.isEmpty else {
            fatalError("SupabaseAnonKey missing in Info.plist (set SUPABASE_ANON_KEY build setting)")
        }
        return raw
    }

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
