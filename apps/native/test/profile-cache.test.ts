import { describe, expect, it } from "vitest";
import type { ProfileInterest, ProfilePhoto } from "@peekpoke/shared";
import { mergePhoto, removeInterest, removePhoto } from "@/data/profile/cache";

const photo = (id: string, isPrivate = false) => ({
  id,
  is_private: isPrivate,
} as ProfilePhoto);

const interest = (id: string) => ({ id } as ProfileInterest);

describe("profile query cache updates", () => {
  it("replaces only the changed photo", () => {
    const original = [photo("one"), photo("two")];
    const changed = photo("two", true);

    expect(mergePhoto(original, changed)).toEqual([original[0], changed]);
  });

  it("removes photos and interests without mutating cached arrays", () => {
    const photos = [photo("one"), photo("two")];
    const interests = [interest("music"), interest("travel")];

    expect(removePhoto(photos, "one")).toEqual([photos[1]]);
    expect(removeInterest(interests, "travel")).toEqual([interests[0]]);
    expect(photos).toHaveLength(2);
    expect(interests).toHaveLength(2);
  });
});
