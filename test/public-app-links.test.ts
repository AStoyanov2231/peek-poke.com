import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/apple-app-site-association/route";

const nativeConfig = JSON.parse(readFileSync(new URL("../apps/native/app.json", import.meta.url), "utf8")).expo;

describe("public invitation app links", () => {
  it("associates both profile invitations and Plan previews with the iOS app", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const document = await response.json();
    const association = document.applinks.details.find((entry: { appIDs: string[] }) =>
      entry.appIDs.some((id) => id.endsWith(`.${nativeConfig.ios.bundleIdentifier}`)),
    );
    expect(association.components).toEqual([{ "/": "/invite/*" }, { "/": "/plan/*" }]);
    expect(nativeConfig.ios.associatedDomains).toContain("applinks:www.peek-poke.com");
  });

  it("lets Android open the same canonical Plan and profile invitation links", () => {
    const supportedPaths = nativeConfig.android.intentFilters
      .filter((filter: { action: string; autoVerify: boolean }) => filter.action === "VIEW" && filter.autoVerify)
      .flatMap((filter: { data: { scheme: string; host: string; pathPrefix: string }[] }) => filter.data)
      .filter((entry: { scheme: string; host: string }) => entry.scheme === "https" && entry.host === "www.peek-poke.com")
      .map((entry: { pathPrefix: string }) => entry.pathPrefix);
    expect(supportedPaths).toEqual(["/invite/", "/plan/"]);
  });
});
