import { describe, expect, it } from "vitest";
import { parseSocialChangedHint } from "@/features/inbox/social-realtime";

const POKE_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "22222222-2222-4222-8222-222222222222";

describe("Poke social realtime hints", () => {
  it("accepts only the minimal received Poke hint", () => {
    expect(parseSocialChangedHint({ payload: { changed: true, resource: "pokes", action: "received", poke_id: POKE_ID } }))
      .toEqual({ changed: true, resource: "pokes", action: "received", poke_id: POKE_ID });
  });

  it("requires a thread only for an accepted Poke", () => {
    expect(parseSocialChangedHint({ payload: { changed: true, resource: "pokes", action: "accepted", poke_id: POKE_ID, thread_id: THREAD_ID } }))
      .toMatchObject({ action: "accepted", thread_id: THREAD_ID });
    expect(parseSocialChangedHint({ payload: { changed: true, resource: "pokes", action: "accepted", poke_id: POKE_ID } })).toBeNull();
  });

  it("rejects untrusted fields, identifiers, and unrelated resources", () => {
    expect(parseSocialChangedHint({ payload: { changed: true, resource: "pokes", action: "received", poke_id: POKE_ID, note: "private" } })).toBeNull();
    expect(parseSocialChangedHint({ payload: { changed: true, resource: "friends", action: "received", poke_id: POKE_ID } })).toBeNull();
    expect(parseSocialChangedHint({ payload: { changed: true, resource: "pokes", action: "received", poke_id: "not-a-uuid" } })).toBeNull();
  });
});
