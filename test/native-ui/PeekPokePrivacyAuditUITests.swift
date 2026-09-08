import XCTest

final class PeekPokePrivacyAuditUITests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.peekpoke.app")

  private func radio(_ label: String) -> XCUIElement {
    app.descendants(matching: .other)
      .matching(NSPredicate(
        format: "label == %@ AND value BEGINSWITH[c] %@",
        label,
        "radio button"
      ))
      .firstMatch
  }

  private func isChecked(_ element: XCUIElement) -> Bool {
    guard let value = element.value as? String else { return false }
    let normalized = value.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    return normalized.hasSuffix("checked") && !normalized.hasSuffix("unchecked")
  }

  private func requireRadio(_ label: String, timeout: TimeInterval = 8) -> XCUIElement {
    let element = radio(label)
    guard element.waitForExistence(timeout: timeout) else {
      XCTFail("Missing radio control \(label).\n\(app.debugDescription)")
      return element
    }
    return element
  }

  private func requireButton(_ label: String, timeout: TimeInterval = 8) -> XCUIElement {
    let element = app.buttons[label]
    guard element.waitForExistence(timeout: timeout) else {
      XCTFail("Missing button \(label).\n\(app.debugDescription)")
      return element
    }
    return element
  }

  private func attachScreenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  // This endpoint exists only in the loopback native test fixture.
  private func setConversationMode(_ mode: String, durationMs: Int = 86_400_000) {
    var request = URLRequest(url: URL(string: "http://127.0.0.1:3002/__test/conversation-state")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try! JSONSerialization.data(withJSONObject: ["mode": mode, "duration_ms": durationMs])
    let done = expectation(description: "Set synthetic conversation mode")
    URLSession.shared.dataTask(with: request) { _, response, error in
      XCTAssertNil(error)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      done.fulfill()
    }.resume()
    wait(for: [done], timeout: 8)
  }

  private func foregroundConversation() {
    XCUIDevice.shared.press(.home)
    app.activate()
  }

  func testExpiredConversationRetainsHistoryAndOffersNewPoke() {
    setConversationMode("expired")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    if springboard.buttons["Open"].waitForExistence(timeout: 2) {
      springboard.buttons["Open"].tap()
    }
    app.activate()
    let server = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "http://127.0.0.1:8081")).firstMatch
    if server.waitForExistence(timeout: 3) { server.tap() }
    if !app.staticTexts["This Poke conversation has ended."].exists {
      requireButton("Inbox", timeout: 60).tap()
      if app.buttons["I'm in"].waitForExistence(timeout: 3) {
        app.buttons["I'm in"].tap()
      } else {
        requireButton("Chats").tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Mila,")).firstMatch.tap()
      }
    }
    XCTAssertTrue(app.staticTexts["This Poke conversation has ended."].waitForExistence(timeout: 15), app.debugDescription)
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "See you by the café.")).firstMatch.waitForExistence(timeout: 8), app.debugDescription)
    XCTAssertFalse(app.buttons["Start video call"].exists)
    XCTAssertFalse(app.buttons["Send message"].exists)
    attachScreenshot("conversation-expired")
    requireButton("Send a new Poke").tap()
    XCTAssertTrue(app.buttons["Send Poke"].waitForExistence(timeout: 8), app.debugDescription)
    attachScreenshot("conversation-new-poke")
    requireButton("Cancel").tap()
    XCTAssertTrue(app.staticTexts["This Poke conversation has ended."].waitForExistence(timeout: 8))

    setConversationMode("active", durationMs: 25_000)
    foregroundConversation()
    let composer = app.textFields["Message..."]
    XCTAssertTrue(composer.waitForExistence(timeout: 10), app.debugDescription)
    composer.tap()
    composer.typeText("Keep this draft")
    XCTAssertTrue(app.buttons["Send message"].exists)
    XCTAssertTrue(app.staticTexts["This Poke conversation has ended."].waitForExistence(timeout: 35), app.debugDescription)
    XCTAssertFalse(app.buttons["Send message"].exists)
    attachScreenshot("conversation-draft-expired")

    setConversationMode("unavailable")
    foregroundConversation()
    XCTAssertTrue(app.buttons["Retry conversation access"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["Send message"].exists)
    setConversationMode("active")
    requireButton("Retry conversation access").tap()
    let recovered = app.textFields.matching(NSPredicate(format: "value == %@", "Keep this draft")).firstMatch
    XCTAssertTrue(recovered.waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertTrue(app.buttons["Start video call"].exists)
    attachScreenshot("conversation-draft-recovered")
  }

  func testDiscoveryVisibilitySelectionPersistsAfterCloseAndReopen() {
    app.activate()

    let friends = requireRadio("Friends")
    let circles = requireRadio("Your Circles")
    let target = isChecked(circles) ? friends : circles
    XCTAssertFalse(isChecked(target), "The runner must choose an audience different from the initial selection")
    attachScreenshot("discovery-before-selection")

    target.tap()
    XCTAssertTrue(isChecked(target), "\(target.label) did not become selected")

    let save = requireButton("Save visibility")
    save.tap()
    RunLoop.current.run(until: Date().addingTimeInterval(1))
    XCTAssertFalse(app.staticTexts["Couldn’t save visibility. Try again."].exists, "Visibility save reported an error")
    attachScreenshot("discovery-after-save")

    requireButton("Close").tap()
    requireButton("Settings").tap()
    requireButton("Discovery visibility").tap()

    let reopenedTarget = requireRadio(target.label)
    XCTAssertTrue(isChecked(reopenedTarget), "\(target.label) was not selected after reopening Settings")
    attachScreenshot("discovery-reopened")
  }
}
