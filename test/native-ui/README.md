# Native UI audit harness

This opt-in XCUITest runner targets the already installed `com.peekpoke.app` Simulator bundle.

It verifies that a Discovery visibility choice persists after Save, Settings close, and reopening Discovery visibility.

It requires the native fixture API, fixture Supabase auth service, and Metro to be running with the test account already signed in.

Start from Profile > Settings > Discovery visibility with the sheet open.

Ruby with the `xcodeproj` gem and a compatible Xcode Simulator runtime are required.
Generate only the ignored temporary Xcode project with `ruby test/native-ui/generate-project.rb`.

Select an isolated XcodeBuildMCP profile with that generated project, the `PeekPokePrivacyAuditUITests` scheme, the intended booted Simulator, and an isolated DerivedData path.

Run XcodeBuildMCP `test_sim` with progress enabled.

The runner selects the opposite of the current Friends or Your Circles state, allows the fixture request to settle, rejects a visible Save error, then checks the selected state after closing and reopening Discovery visibility.

The corrected runner passed 1 test in 21.9 seconds.

The local result-bundle path is retained in ignored `test-results/native/discovery-visibility-reopen.receipt.txt`.
The reopened screenshot shows Friends selected, and a separate read-only fixture GET returned `{"audience":"friends"}`.

The test covers Simulator accessibility and fixture-backed persistence only.

It does not prove physical-device behavior or production API behavior.
