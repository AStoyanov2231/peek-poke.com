# Native UI audit harness

This opt-in XCUITest runner targets the already installed `com.peekpoke.app` Simulator bundle.

It verifies that a Discovery visibility choice persists after Save, Settings close, and reopening Discovery visibility.

It requires the native fixture API, fixture Supabase auth service, and Metro to be running with the test account already signed in.

Start from Profile > Settings > Discovery visibility with the sheet open.

Ruby with the `xcodeproj` gem and a compatible Xcode Simulator runtime are required.
Generate only the ignored temporary Xcode project with `ruby test/native-ui/generate-project.rb`.

Select an isolated XcodeBuildMCP profile with that generated project, the `PeekPokePrivacyAuditUITests` scheme, the intended booted Simulator, and an isolated DerivedData path.

Run XcodeBuildMCP `test_sim` with progress enabled and select the intended test with `-only-testing`; the privacy and conversation journeys require different starting screens.

The runner selects the opposite of the current Friends or Your Circles state, allows the fixture request to settle, rejects a visible Save error, then checks the selected state after closing and reopening Discovery visibility.

The corrected runner passed 1 test in 21.9 seconds.

The local result-bundle path is retained in ignored `test-results/native/discovery-visibility-reopen.receipt.txt`.
The reopened screenshot shows Friends selected, and a separate read-only fixture GET returned `{"audience":"friends"}`.

The test covers Simulator accessibility and fixture-backed persistence only.

It does not prove physical-device behavior or production API behavior.

## Temporary conversations

`testExpiredConversationRetainsHistoryAndOffersNewPoke` uses only the loopback fixture at port 3002 and an already signed-in development app.
Start from the Now screen or the synthetic expired conversation with Mila.
The runner opens Inbox, accepts the fixture Poke when needed, and checks readable history, missing message/call controls, and new Poke opening/cancellation.
It then renews the synthetic window for 25 seconds, types `Keep this draft`, waits for timer expiry, simulates unavailable access, and verifies that retry after renewal restores the draft and call action.
It never taps Send or submits a Poke.
Run only this method with `-only-testing:PeekPokePrivacyAuditUITests/PeekPokePrivacyAuditUITests/testExpiredConversationRetainsHistoryAndOffersNewPoke`.
Use a fresh empty draft for repeat runs; the test deliberately preserves its final unsent text.
The fixture state endpoint is not a production API.
The final iOS run passed in 54.3 seconds, and a separate fixture counter read confirmed zero message sends.
This is installed development-app evidence, not release signing, physical-device, or store-distribution proof.

`testConversationExpiryPreservesOpenPlanDraft` starts from Now or the synthetic chat, opens the Plan composer, types a title, refreshes access to a four-second window, and verifies the title survives expiry.
After Cancel it checks that message and call actions are still absent.
The installed iOS test passes in 25.9 seconds; it does not create a Plan or message the peer.
