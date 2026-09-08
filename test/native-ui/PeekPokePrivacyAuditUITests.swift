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
