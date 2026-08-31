import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("legacy social navigation remains a first-class product path", () => {
  it("keeps the complete web map, inbox, and direct-message screens mounted", () => {
    expect(source("src/app/(main)/page.tsx")).toContain('import MainMapPage from "@/features/map/components/MainMapPage"');
    expect(source("src/app/(main)/inbox/page.tsx")).toContain('import InboxPage from "@/features/inbox/components/InboxPage"');
    expect(source("src/app/(main)/chat/[threadId]/page.tsx")).toContain('import ChatPage from "@/features/chat/components/ChatPage"');
    expect(source("src/app/invite/[inviterId]/page.tsx")).toContain('import InvitePage from "@/features/invites/components/InvitePage"');
  });

  it("exposes map, inbox, and additive Rooms navigation together", () => {
    const desktop = source("src/features/layout/components/DesktopNav.tsx");
    const mobile = source("src/features/layout/components/MobileNav.tsx");
    for (const navigation of [desktop, mobile]) {
      expect(navigation).toContain('href: "/"');
      expect(navigation).toContain('href: "/inbox"');
      expect(navigation).toContain('href: "/rooms"');
    }
  });

  it("keeps the native map, inbox, and direct-message implementations", () => {
    expect(source("apps/native/app/index.tsx")).toContain('"/(app)/map"');
    expect(source("apps/native/app/(app)/map.tsx")).toContain("Mapbox.MapView");
    expect(source("apps/native/app/(app)/inbox.tsx")).toContain("SegmentedControl");
    expect(source("apps/native/app/chat/[threadId].tsx")).toContain("fetchMessages");
    expect(source("apps/native/app/(app)/_layout.tsx")).toContain('label: "Rooms"');
  });
});
