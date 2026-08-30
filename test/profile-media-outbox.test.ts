import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupProfileMediaModerationOnDeadLetter,
  handleProfileMediaModeration,
} from "@/server/outbox/profile-media";

const PHOTO_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const storageOrigin = "https://project.supabase.co";

type OperationState = "pending" | "publish" | "finalized" | "stale";
const state = {
  operation: "pending" as OperationState,
  finalizeError: null as null | { message: string },
  finalizeCommits: true,
  completeError: null as null | { message: string },
  completeCommits: true,
  completeFailureState: null as OperationState | null,
  copyFailureAt: null as number | null,
};
const calls: string[] = [];
let copyCount = 0;
let anonymouslyExposedWithoutApproval = 0;

const storage = {
  remove: vi.fn(async (bucket: string, paths: string[]) => {
    calls.push(`remove:${bucket}:${paths.join(",")}`);
    return { error: null };
  }),
  copy: vi.fn(async (bucket: string, source: string, destination: string, destinationBucket: string) => {
    copyCount += 1;
    if (
      destinationBucket === "approved-profile-photos"
      && state.operation !== "publish"
      && state.operation !== "finalized"
    ) {
      anonymouslyExposedWithoutApproval += 1;
    }
    calls.push(`copy:${bucket}:${source}:${destinationBucket}:${destination}`);
    return {
      error: state.copyFailureAt === copyCount ? { message: "copy failed" } : null,
    };
  }),
};

const client = {
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "profile_media_operation_state") return { data: state.operation, error: null };
    if (name === "finalize_profile_media_moderation") {
      calls.push("finalize");
      if (state.finalizeCommits) {
        state.operation = args.p_action === "approve"
          && args.p_storage_bucket === "approved-profile-photos"
          ? "publish"
          : "finalized";
      }
      return state.finalizeError
        ? { data: null, error: state.finalizeError }
        : { data: { id: PHOTO_ID }, error: null };
    }
    if (name === "complete_profile_media_publication") {
      calls.push("complete");
      if (state.completeFailureState) state.operation = state.completeFailureState;
      else if (state.completeCommits) state.operation = "finalized";
      return state.completeError
        ? { data: null, error: state.completeError }
        : { data: { id: PHOTO_ID }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }),
  storage: {
    from: (bucket: string) => ({
      remove: (paths: string[]) => storage.remove(bucket, paths),
      copy: (source: string, destination: string, options: { destinationBucket: string }) =>
        storage.copy(bucket, source, destination, options.destinationBucket),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `${storageOrigin}/storage/v1/object/public/${bucket}/${path}` },
      }),
    }),
  },
};

function event(
  action: "approve" | "reject" | "quarantine" = "approve",
  destinationOverride?: "private-profile-photos",
) {
  const destinationBucket = action === "reject"
    ? null
    : action === "quarantine"
      ? "profile-media-quarantine"
      : destinationOverride ?? "approved-profile-photos";
  return {
    aggregate_id: OPERATION_ID,
    payload: {
      photo_id: PHOTO_ID,
      operation_id: OPERATION_ID,
      owner_id: OWNER_ID,
      action,
      source_bucket: "profile-media-quarantine",
      source_path: `${OWNER_ID}/${PHOTO_ID}.jpg`,
      source_thumbnail_path: `${OWNER_ID}/${PHOTO_ID}_thumb.jpg`,
      destination_bucket: destinationBucket,
      destination_path: destinationBucket ? `${OWNER_ID}/${OPERATION_ID}.jpg` : null,
      destination_thumbnail_path: destinationBucket ? `${OWNER_ID}/${OPERATION_ID}_thumb.jpg` : null,
    },
  };
}

const publicObjects = `approved-profile-photos:${OWNER_ID}/${OPERATION_ID}.jpg,${OWNER_ID}/${OPERATION_ID}_thumb.jpg`;
const sourceObjects = `profile-media-quarantine:${OWNER_ID}/${PHOTO_ID}.jpg,${OWNER_ID}/${PHOTO_ID}_thumb.jpg`;

describe("profile media durable Storage lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    copyCount = 0;
    anonymouslyExposedWithoutApproval = 0;
    state.operation = "pending";
    state.finalizeError = null;
    state.finalizeCommits = true;
    state.completeError = null;
    state.completeCommits = true;
    state.completeFailureState = null;
    state.copyFailureAt = null;
  });

  afterEach(() => {
    expect(anonymouslyExposedWithoutApproval).toBe(0);
  });

  it("authorizes the exact approved row before any object enters public Storage", async () => {
    await handleProfileMediaModeration(client as never, event());

    expect(calls).toEqual([
      "finalize",
      `remove:${publicObjects}`,
      `copy:profile-media-quarantine:${OWNER_ID}/${PHOTO_ID}.jpg:approved-profile-photos:${OWNER_ID}/${OPERATION_ID}.jpg`,
      `copy:profile-media-quarantine:${OWNER_ID}/${PHOTO_ID}_thumb.jpg:approved-profile-photos:${OWNER_ID}/${OPERATION_ID}_thumb.jpg`,
      "complete",
      `remove:${sourceObjects}`,
    ]);
    expect(client.rpc).toHaveBeenCalledWith("finalize_profile_media_moderation", expect.objectContaining({
      p_action: "approve",
      p_storage_bucket: "approved-profile-photos",
      p_url: `${storageOrigin}/storage/v1/object/public/approved-profile-photos/${OWNER_ID}/${OPERATION_ID}.jpg`,
    }));
  });

  it("never copies publicly when finalization fails before committing approval", async () => {
    state.finalizeCommits = false;
    state.finalizeError = { message: "database unavailable" };

    await expect(handleProfileMediaModeration(client as never, event())).rejects.toMatchObject({
      message: "database unavailable",
    });

    expect(calls).toEqual(["finalize", `remove:${publicObjects}`]);
    expect(storage.copy).not.toHaveBeenCalled();
    expect(state.operation).toBe("pending");
  });

  it("reconciles an ambiguous finalizer that committed before its response failed", async () => {
    state.finalizeError = { message: "response lost after commit" };

    await expect(handleProfileMediaModeration(client as never, event())).resolves.toBeUndefined();

    expect(calls[0]).toBe("finalize");
    expect(calls.findIndex((call) => call.startsWith("copy:"))).toBeGreaterThan(0);
    expect(state.operation).toBe("finalized");
  });

  it("compensates synchronously when the thumbnail copy fails after the main copy", async () => {
    state.copyFailureAt = 2;

    await expect(handleProfileMediaModeration(client as never, event()))
      .rejects.toThrow("Profile media promotion copy failed");

    expect(calls.at(-1)).toBe(`remove:${publicObjects}`);
    expect(calls.indexOf("finalize")).toBeLessThan(calls.findIndex((call) => call.startsWith("copy:")));
    expect(state.operation).toBe("publish");
  });

  it("keeps the quarantined source recoverable when the main destination copy fails", async () => {
    state.copyFailureAt = 1;

    await expect(handleProfileMediaModeration(client as never, event()))
      .rejects.toThrow("Profile media promotion copy failed");

    expect(state.operation).toBe("publish");
    expect(calls.at(-1)).toBe(`remove:${publicObjects}`);
    expect(calls).not.toContain(`remove:${sourceObjects}`);
  });

  it("compensates both public copies when completion fails before committing", async () => {
    state.completeCommits = false;
    state.completeError = { message: "completion unavailable" };

    await expect(handleProfileMediaModeration(client as never, event())).rejects.toMatchObject({
      message: "completion unavailable",
    });

    expect(calls.at(-1)).toBe(`remove:${publicObjects}`);
    expect(state.operation).toBe("publish");
  });

  it("keeps tracked public copies when completion committed but its response failed", async () => {
    state.completeError = { message: "response lost after completion" };

    await expect(handleProfileMediaModeration(client as never, event())).resolves.toBeUndefined();

    expect(state.operation).toBe("finalized");
    expect(calls.at(-1)).toBe(`remove:${sourceObjects}`);
    expect(calls.filter((call) => call === `remove:${publicObjects}`)).toHaveLength(1);
  });

  it("cleans public copies when the exact operation becomes stale after copying", async () => {
    state.completeCommits = false;
    state.completeError = { message: "decision reversed" };
    state.completeFailureState = "stale";

    await expect(handleProfileMediaModeration(client as never, event())).resolves.toBeUndefined();

    expect(calls.at(-1)).toBe(`remove:${publicObjects}`);
    expect(calls).not.toContain(`remove:${sourceObjects}`);
  });

  it("retries a publish-state approval without repeating database authorization", async () => {
    state.operation = "publish";

    await handleProfileMediaModeration(client as never, event());

    expect(calls).not.toContain("finalize");
    expect(calls[0]).toBe(`remove:${publicObjects}`);
    expect(calls).toContain("complete");
  });

  it("preserves the source and destination so a publish-state event cannot dead-letter", async () => {
    state.operation = "publish";

    const canDeadLetter = await cleanupProfileMediaModerationOnDeadLetter(client as never, event());

    expect(canDeadLetter).toBe(false);
    expect(calls).toEqual([]);
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("cleans an uncertain pending destination but keeps its active operation live", async () => {
    state.operation = "pending";

    const canDeadLetter = await cleanupProfileMediaModerationOnDeadLetter(client as never, event());

    expect(canDeadLetter).toBe(false);
    expect(calls).toEqual([`remove:${publicObjects}`]);
  });

  it("allows terminal cleanup only after the operation becomes stale", async () => {
    state.operation = "stale";

    const canDeadLetter = await cleanupProfileMediaModerationOnDeadLetter(client as never, event());

    expect(canDeadLetter).toBe(true);
    expect(calls).toEqual([`remove:${publicObjects}`]);
  });

  it("replays a finalized approval by deleting only quarantine sources", async () => {
    state.operation = "finalized";

    await handleProfileMediaModeration(client as never, event());

    expect(calls).toEqual([`remove:${sourceObjects}`]);
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("preserves private-approved ordering and signed-storage behavior", async () => {
    await handleProfileMediaModeration(client as never, event("approve", "private-profile-photos"));

    expect(calls[0]).toBe(
      `remove:private-profile-photos:${OWNER_ID}/${OPERATION_ID}.jpg,${OWNER_ID}/${OPERATION_ID}_thumb.jpg`,
    );
    expect(calls.findIndex((call) => call.startsWith("copy:"))).toBeLessThan(calls.indexOf("finalize"));
    expect(calls).not.toContain("complete");
  });

  it("deletes every source before committing rejection and performs no public copy", async () => {
    await handleProfileMediaModeration(client as never, event("reject"));

    expect(calls).toEqual([`remove:${sourceObjects}`, "finalize"]);
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("rejects forged cross-owner paths before Storage or database mutation", async () => {
    const forged = event();
    forged.payload.source_path = `44444444-4444-4444-8444-444444444444/${PHOTO_ID}.jpg`;

    await expect(handleProfileMediaModeration(client as never, forged))
      .rejects.toThrow("outside its owner boundary");
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.copy).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
