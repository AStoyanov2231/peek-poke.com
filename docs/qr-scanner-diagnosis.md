# QR scanner launch diagnosis

## Setup and path

- Revision under test: `44e7fae` (`Cleanup`), before this fix.
- User path: authenticated web map (`/`) -> map overlay QR button (`Scan a QR code to join a shared group`) -> `QrScannerDialog` -> scanner effect `start()`.
- Expected: opening the scanner requests camera access when the browser supports camera capture and permission is undecided; after access is granted, a live preview and QR decoder are active.
- Actual in code: `start()` checked for `window.BarcodeDetector` before calling `navigator.mediaDevices.getUserMedia()`. When native decoding was absent, it entered the unsupported state, showing a dark preview panel and `Camera scanning is unavailable` without attempting camera acquisition.

## Repeatability and diagnosis

The cause is deterministic and was reproduced with the existing lifecycle harness: an environment with `BarcodeDetector` absent and a camera-capable `getUserMedia` stub reached the unsupported branch without calling `getUserMedia`. The smallest disconfirming counterfactual is now covered by `test/shared-qr-scanner-lifecycle.test.ts`: with the native detector absent, camera acquisition is still called before the bundled canvas decoder is selected.

This was not established as a permission-only failure. Permission denial, an absent camera, insecure context, missing camera API, decoder availability, and playback failures are separate conditions in the scanner state model. Existing browser grants or denials are controlled by the browser and should not be expected to prompt again automatically.

## Masking conditions and limits

- Camera capture is gated by a secure context and `navigator.mediaDevices.getUserMedia`; HTTPS is required outside localhost.
- Browser support varies for `BarcodeDetector`; the web scanner now uses the bundled `jsqr` canvas decoder when native detection is unavailable.
- Existing browser permission decisions, device camera availability, another tab holding the camera, and autoplay/playback policy can change the visible result.
- A physical browser reproduction was attempted with `chrome-devtools-axi`, but this worktree environment has no installed Google Chrome executable. The local Next.js server also cannot render the authenticated route without the worktree's Supabase URL/key environment. Therefore no physical camera, real permission prompt, desktop/mobile screenshot, or hardware decoder result is claimed here.
- Mocked lifecycle tests cover acquisition ordering, insecure context, denied permission, missing camera, cleanup, canvas fallback decoding, and decoder-unavailable behavior. Native tests cover Expo callback duplicate suppression, permission lifecycle, retry, app-state cleanup, and the removal of manual entry.

The scanner never parses, fetches, executes, or navigates to decoded QR content. The decoded text remains subject to the shared server validation and authorization flow.
