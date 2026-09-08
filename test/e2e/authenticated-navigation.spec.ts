import { expect, test } from "@playwright/test";
import { installSocialFixture, peerId, planId, threadId } from "./social-fixture";
const email = process.env.E2E_EMAIL ?? "e2e@peek-poke.test";
const password = process.env.E2E_PASSWORD ?? "fixture-password";
const canRun = process.env.E2E_FIXTURE === "1";

test.describe("redesigned social journey", () => {
  test.use({ timezoneId: "Europe/Sofia" });
  test.skip(!canRun, "Requires an isolated loopback environment.");
  test("age admission sends adults to their intended destination and keeps blocked accounts out of social routes", async ({ page, browser }) => {
    const adultFixture = await installSocialFixture(page, { ageAdmission: "pending" });
    await page.goto("/login?redirectTo=/now");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/age-gate");
    await expect(page.getByRole("heading", { name: "Are you 18 or older?" })).toBeVisible();
    await page.getByLabel("Day of birth").fill("1");
    await page.getByLabel("Month of birth").fill("1");
    await page.getByLabel("Year of birth").fill("2000");
    await page.getByRole("button", { name: "Review date", exact: true }).click();
    await expect(page.getByText("1 January 2000", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Confirm and continue", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/now");
    await expect(page.getByRole("heading", { name: "What are you up for?" })).toBeVisible();
    expect(adultFixture.apiPaths).toContain("/api/age-admission");

    const blockedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const blockedPage = await blockedContext.newPage();
    try {
      const blockedFixture = await installSocialFixture(blockedPage, { ageAdmission: "pending" });
      await blockedPage.goto("/login?redirectTo=/now");
      await blockedPage.getByPlaceholder("Email").fill(email);
      await blockedPage.getByPlaceholder("Password").fill(password);
      await blockedPage.getByRole("button", { name: /^sign in$/i }).click();
      await blockedPage.waitForURL((url) => url.pathname === "/age-gate");
      await expect(blockedPage.getByRole("heading", { name: "Are you 18 or older?" })).toBeVisible();
      const dateInputs = [
        blockedPage.getByLabel("Day of birth"),
        blockedPage.getByLabel("Month of birth"),
        blockedPage.getByLabel("Year of birth"),
      ];
      const inputHeights = await Promise.all(dateInputs.map((input) => input.evaluate((element) => element.getBoundingClientRect().height)));
      expect(inputHeights.every((height) => height >= 44)).toBe(true);
      await blockedPage.screenshot({ path: "test-results/e2e/age-admission-pending-mobile.png", fullPage: true });
      await blockedPage.getByLabel("Day of birth").fill("1");
      await blockedPage.getByLabel("Month of birth").fill("1");
      await blockedPage.getByLabel("Year of birth").fill("2010");
      await blockedPage.getByRole("button", { name: "Review date", exact: true }).click();
      await expect(blockedPage.getByText("1 January 2010", { exact: true })).toBeVisible();
      await blockedPage.screenshot({ path: "test-results/e2e/age-admission-review-mobile.png", fullPage: true });
      await blockedPage.getByRole("button", { name: "Confirm and continue", exact: true }).click();
      await expect(blockedPage.getByRole("heading", { name: "Peek & Poke is for adults" })).toBeVisible();
      await blockedPage.screenshot({ path: "test-results/e2e/age-admission-blocked-mobile.png", fullPage: true });
      await blockedPage.reload();
      await expect(blockedPage.getByRole("heading", { name: "Peek & Poke is for adults" })).toBeVisible();
      expect(blockedFixture.apiPaths).toContain("/api/age-admission");
      expect(blockedFixture.apiPaths.every((path) => path === "/api/age-admission")).toBe(true);
      await blockedPage.setViewportSize({ width: 1280, height: 720 });
      await blockedPage.screenshot({ path: "test-results/e2e/age-admission-blocked.png", fullPage: true });
    } finally {
      await blockedContext.close();
    }
  });
  test("password recovery callback remains reachable for a pending account", async ({ page }) => {
    await page.request.post("http://127.0.0.1:54321/__test/age-admission", {
      data: { status: "pending" },
    });

    // The fixture callback server reports localhost as its request origin, so
    // keep the PKCE verifier cookie on that same loopback host.
    await page.goto("http://localhost:3001/login");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText("If an account exists for that email, a password-reset link has been sent.")).toBeVisible();
    await page.goto("http://localhost:3001/auth/callback?code=fixture-recovery-code&next=/reset-password");
    await page.waitForURL((url) => url.pathname === "/reset-password");
    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  });
  test("a specific Plan needs explicit confirmation and retries the same acknowledgement", async ({ page }) => {
    const fixture = await installSocialFixture(page, { planMeetup: true });
    await page.goto("/login?redirectTo=/inbox?tab=plans");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/inbox");
    await page.getByRole("tab", { name: "Plans", exact: true }).click();
    await expect(page.getByText("Recent plans", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open recent plan: Coffee & a walk", exact: true }).click();
    await page.waitForURL((url) => url.pathname === `/plans/${planId}`);
    await expect(page.getByText("Mila marked that you met. Did you?", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "We met", exact: true }).click();
    expect(fixture.planMeetupPosts).toHaveLength(0);
    await page.getByRole("dialog").getByRole("button", { name: /^Yes, we met/ }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Confirmation interrupted");
    await page.getByRole("dialog").getByRole("button", { name: /^Yes, we met|^Try again$/ }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("You both marked meeting Mila.", { exact: true })).toBeVisible();
    expect(fixture.planMeetupPosts).toHaveLength(2);
    expect(fixture.planMeetupPosts[0]).toBe(fixture.planMeetupPosts[1]);
    await page.screenshot({ path: "test-results/e2e/plan-confirmed-desktop.png", fullPage: true });
  });
  test("Map and profile carry current intent into a Poke", async ({ page, context }) => {
    await page.addInitScript(() => {
      // Chromium's synthetic sensor streams watchPosition but never fulfils a
      // maximumAge: 0 read. This fixture-only adapter supplies a known fresh
      // sample to exercise the production synchronization request. It is not
      // physical GPS proof, which remains covered by device validation.
      const syntheticPosition = { latitude: 42.7, longitude: 23.32 };
      const geolocation = navigator.geolocation;
      geolocation.getCurrentPosition = (success, _failure, options) => {
        if (options?.maximumAge !== 0) return;
        queueMicrotask(() => success({
          coords: {
            latitude: syntheticPosition.latitude,
            longitude: syntheticPosition.longitude,
            accuracy: 1,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition));
      };
    });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 42.7, longitude: 23.32 });
    await installSocialFixture(page, { map: true });
    await page.goto("/login?redirectTo=/map");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/map");
    await page.getByRole("button", { name: "View Mila, up for coffee", exact: true }).click();
    await expect(page.locator(".map-activity-card:visible")).toContainText("Up for coffee");
    await expect(page.locator(".user-pin-available:visible")).toHaveCount(1);
    await page.screenshot({ path: "test-results/e2e/map-activity-desktop.png", animations: "disabled" });
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.waitForURL((url) => url.pathname === `/profile/${peerId}`);
    await expect(page.getByText("Up for coffee", { exact: true })).toBeVisible();
    await expect(page.getByText("You both marked 1 meetup.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Poke", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("combobox")).toHaveValue("coffee");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator("body").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: "test-results/e2e/profile-context-mobile.png", fullPage: true });
  });
  test("first visit reaches real intent after a name and three interests", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.request.post("http://127.0.0.1:54321/__test/onboarding", { data: { completed: false } });
    try {
      await installSocialFixture(page, { onboarding: true });
      await page.goto("/login?redirectTo=/now");
      await expect(page.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
      await page.getByPlaceholder("Email").fill(email);
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: /^sign in$/i }).click();
      await page.waitForURL((url) => url.pathname === "/onboarding");
      await expect(page.getByLabel("Your name", { exact: true })).toBeVisible({ timeout: 5000 });
      await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
      await page.getByLabel("Your name", { exact: true }).fill("Nikola");
      await page.getByLabel("Username", { exact: true }).fill("nikola");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      for (const name of ["Coffee", "Design", "Walking"]) await page.getByRole("button", { name, exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("heading", { name: "What are you up for?" })).toBeVisible();
      await page.getByRole("button", { name: "Coffee", exact: true }).click();
      await page.getByRole("button", { name: "I’m up for it", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Find people around you" })).toBeVisible();
      await page.screenshot({ path: "test-results/e2e/onboarding-location-mobile.png", fullPage: true });
      await page.getByRole("button", { name: "Not now", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/now");
      await expect(page.getByText("You’re up for coffee", { exact: false })).toBeVisible();
      expect(await page.locator("body").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    } finally {
      await page.request.post("http://127.0.0.1:54321/__test/onboarding", { data: { completed: true } });
    }
  });
  test("public page is useful before sign-in and fits a phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Find out",
    );
    await expect(
      page.getByRole("link", { name: "See who’s around" }),
    ).toBeVisible();
    expect(
      await page
        .locator(".public-page")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: "test-results/e2e/landing-mobile.png" });
    await page.getByRole("link", { name: "See who’s around" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("redirectTo")).toBe("/now");
  });
  test("Now saves expiring intent and retries a Poke without a new key", async ({
    page,
  }) => {
    const fixture = await installSocialFixture(page, {
      discoveryContext: true,
      retryPoke: true,
    });
    await page.goto("/login?redirectTo=/now");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/now");
    await expect(
      page.getByRole("heading", { name: "What are you up for?" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Mila/ })).toBeVisible();
    const discoveryCards = page.locator(".person-intent-card");
    await expect(discoveryCards).toHaveCount(2);
    await expect(discoveryCards.nth(0).getByRole("link", { name: /Sofia/ })).toBeVisible();
    await expect(discoveryCards.nth(1).getByRole("link", { name: /Mila/ })).toBeVisible();
    await expect(
      discoveryCards.nth(0).getByText("You both marked a meetup · Connected before", { exact: true }),
    ).toBeVisible();
    await expect(discoveryCards.nth(0).getByText("Friends in common", { exact: true })).toHaveCount(0);
    expect(fixture.apiUrls).toContain(
      "/api/availability?limit=100&radiusKm=25&discovery_context=1",
    );
    await page.screenshot({
      path: "test-results/e2e/now-context-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await discoveryCards.nth(0).evaluate((element) =>
        element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/e2e/now-context-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Coffee", exact: true }).click();
    await page
      .getByRole("button", { name: "I’m up for it", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your availability will end automatically",
    );
    await page.screenshot({ path: "test-results/e2e/now-desktop.png" });
    await page
      .getByRole("button", { name: "Poke: Coffee", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send a poke", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Connection interrupted",
    );
    await page
      .getByRole("button", { name: "Send a poke", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Poke sent");
    expect(fixture.pokeKeys).toHaveLength(2);
    expect(fixture.pokeKeys[0]).toBe(fixture.pokeKeys[1]);
    expect(page.url()).not.toContain("password");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .locator(".now-page")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page
      .getByRole("heading", { name: "What are you up for?" })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: "test-results/e2e/now-mobile.png",
      fullPage: true,
    });
  });
  test("accepted Poke opens chat and a suggestion stays editable before creating a Plan", async ({
    page,
  }) => {
    const fixture = await installSocialFixture(page, { peerMet: true, venues: true });
    let sentMessages = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === `/api/dm/${threadId}`) {
        sentMessages += 1;
      }
    });
    await page.goto("/login?redirectTo=/inbox");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/inbox");
    await expect(page.getByText("Mila wants to make a plan")).toBeVisible();
    await page.screenshot({ path: "test-results/e2e/inbox-desktop.png" });
    await page.getByRole("button", { name: "I’m in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === `/chat/${threadId}`);
    const draft = page.getByRole("textbox", { name: "Message...", exact: true });
    await draft.fill("I can meet after work.");
    await page
      .getByRole("button", { name: "Would 20 minutes work?", exact: true })
      .click();
    await expect(draft).toHaveValue("I can meet after work. Would 20 minutes work?");
    await expect(
      page.getByText("Mila marked that you met. Did you?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "We met", exact: true }).click();
    expect(fixture.meetupPosts).toHaveLength(0);
    await page
      .getByRole("button", { name: "Yes, we met", exact: true })
      .click();
    await expect(page.getByText("You both marked this meetup.")).toBeVisible();
    expect(fixture.meetupPosts).toHaveLength(1);
    await page.getByRole("button", { name: "Suggest place", exact: true }).click();
    await expect(draft).toHaveValue("I can meet after work. Would 20 minutes work? How about Park Café?");
    expect(sentMessages).toBe(0);
    await page.getByRole("button", { name: "Meet here", exact: true }).click();
    const planDialog = page.getByRole("dialog", { name: "Make a plan" });
    await expect(planDialog.getByLabel("Place or area", { exact: true })).toHaveValue("Park Café");
    await planDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Turn this into a plan", exact: true })
      .click();
    await expect(planDialog).toBeVisible();
    await planDialog.getByLabel("What are you doing?").fill("Coffee & a walk");
    const localTime = await page.evaluate(() => {
      const nextHour = new Date(Date.now() + 60 * 60_000);
      const twoDigits = (value: number) => String(value).padStart(2, "0");
      return `${nextHour.getFullYear()}-${twoDigits(nextHour.getMonth() + 1)}-${twoDigits(nextHour.getDate())}T${twoDigits(nextHour.getHours())}:${twoDigits(nextHour.getMinutes())}`;
    });
    await planDialog.getByLabel("When", { exact: true }).fill(localTime);
    await expect(planDialog.getByLabel("When", { exact: true })).toHaveValue(localTime);
    await planDialog
      .getByLabel("Place or area", { exact: true })
      .fill("The café by the park");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/plans") &&
        response.request().method() === "POST",
    );
    await planDialog
      .getByRole("button", { name: "Create plan", exact: true })
      .click();
    expect((await createResponse).ok()).toBe(true);
    await expect(planDialog).not.toBeVisible();
    await page.goto(`/plans/${planId}`);
    await expect(
      page.getByRole("heading", { name: "Coffee & a walk" }),
    ).toBeVisible();
    await page.screenshot({ path: "test-results/e2e/plan-detail.png" });
  });
  test("discovery privacy saves only after acknowledgement and remains recoverable", async ({ page }) => {
    await installSocialFixture(page, { retryVisibility: true });
    await page.goto("/login?redirectTo=/profile");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/profile");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Discovery visibility", exact: true }).click();
    await expect(dialog.getByRole("radio", { name: /^Everyone/ })).toBeChecked();
    await dialog.getByRole("radio", { name: /^Hidden/ }).check();
    await dialog.getByRole("button", { name: "Save visibility", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Couldn’t save");
    await dialog.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Save visibility", exact: true })).toBeDisabled();
    await page.screenshot({ path: "test-results/e2e/discovery-privacy.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // A preference may change on another signed-in device while Settings is
    // closed. Reopening must not present the cached value as an unsaved draft.
    await page.evaluate(async () => {
      const response = await fetch("/api/discovery-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience: "everyone" }),
      });
      if (!response.ok) throw new Error("Fixture preference update failed");
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await dialog.getByRole("button", { name: "Discovery visibility", exact: true }).click();
    await expect(dialog.getByRole("radio", { name: /^Everyone/ })).toBeChecked();
    await dialog.getByRole("button", { name: "Back to settings", exact: true }).click();
    await page.keyboard.press("Escape");

    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await dialog.getByRole("button", { name: "Discovery visibility", exact: true }).click();
    await expect(dialog.getByRole("radio", { name: /^Everyone/ })).toBeChecked();
    await dialog.getByRole("button", { name: "Back to settings", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete Account", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete My Account", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("We couldn't delete your account");
    await expect(dialog.getByRole("button", { name: "Delete My Account", exact: true })).toBeEnabled();
    await expect(dialog).toBeVisible();
  });
  test("public Plan survives sign-in and requires a separate join confirmation", async ({
    page,
  }) => {
    const fixture = await installSocialFixture(page);
    const token = "a".repeat(43);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/plan/${token}`);
    await expect(
      page.getByRole("heading", { name: "Coffee & a walk" }),
    ).toBeVisible();
    await expect(
      page.getByText("The café by the park", { exact: true }),
    ).toBeVisible();
    expect(fixture.planJoins).toHaveLength(0);
    await page.screenshot({
      path: "test-results/e2e/public-plan-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Join this plan", exact: true })
      .click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === `/plan/${token}`);
    await expect(
      page.getByRole("heading", { name: "Coffee & a walk" }),
    ).toBeVisible();
    expect(fixture.planJoins).toHaveLength(0);
    await page
      .getByRole("button", { name: "Join this plan", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === `/plans/${planId}`);
    expect(fixture.planJoins).toEqual([token]);
  });
  test("quiet discovery offers useful actions and a backend outage does not invalidate an invitation", async ({
    page,
  }) => {
    await installSocialFixture(page, { empty: true });
    await page.goto(`/plan/${"u".repeat(43)}`);
    await expect(
      page.getByRole("heading", { name: "We couldn’t load your invitation." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    await page.goto("/login?redirectTo=/now");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/now");
    await expect(
      page.getByRole("heading", {
        name: "A quiet moment. You could start something.",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Look a little further", exact: false })
      .click();
    await expect(page.getByLabel("Discovery radius")).toHaveValue("10");
    await expect(
      page.getByRole("button", { name: "Start a plan", exact: false }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/e2e/now-empty-mobile.png",
      fullPage: true,
    });
  });
});
