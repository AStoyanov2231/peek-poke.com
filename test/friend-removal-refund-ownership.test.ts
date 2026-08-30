import { describe, expect, it } from "vitest";

type Actor = "A" | "B";
type Path = "delete" | "block";
type PublicBody =
  | Readonly<{ success: true; refunded: true; balance: number }>
  | Readonly<{ success: true; refunded: false; balance: null }>
  | Readonly<{ code: "FRIENDSHIP_NOT_FOUND" }>;
type Result = Readonly<{ status: 200 | 404; body: PublicBody; replayed: boolean }>;

class FriendshipRemovalModel {
  private friendship: Readonly<{
    id: string;
    requester: Actor;
    addressee: Actor;
    status: "pending" | "accepted";
  }> | null;
  private readonly records = new Map<string, Result>();
  private refundClaimed = false;
  private walletBalance = 4;
  private walletWriteCount = 0;
  private ledgerWriteCount = 0;
  private removalOutbox: Readonly<Record<string, unknown>> | null = null;

  constructor(status: "pending" | "accepted" = "pending") {
    this.friendship = { id: "friendship-A-B", requester: "A", addressee: "B", status };
  }

  mutate(actor: Actor, path: Path, key: string): Result {
    const recordKey = `${actor}:${path}:${key}`;
    const stored = this.records.get(recordKey);
    if (stored) return { ...stored, replayed: true };

    let result: Result;
    const friendship = this.friendship;
    if (!friendship) {
      result = path === "block"
        ? { status: 200, body: this.neutralBody(), replayed: false }
        : {
            status: 404,
            body: Object.freeze({ code: "FRIENDSHIP_NOT_FOUND" as const }),
            replayed: false,
          };
    } else {
      const refundApplied = friendship.status === "pending";
      if (refundApplied && !this.refundClaimed) {
        this.refundClaimed = true;
        this.walletBalance = Math.min(this.walletBalance + 1, 5);
        this.walletWriteCount += 1;
        this.ledgerWriteCount += 1;
      }

      this.friendship = null;
      this.removalOutbox ??= Object.freeze({
        event_type: "friendship.removed",
        friendship_id: friendship.id,
        requester_id: friendship.requester,
        addressee_id: friendship.addressee,
        actor_id: actor,
        source: path,
        refund_applied: refundApplied,
        refund_owner_id: refundApplied ? friendship.requester : null,
      });
      const callerOwnsRefund = refundApplied && actor === friendship.requester;
      result = {
        status: 200,
        body: callerOwnsRefund
          ? Object.freeze({ success: true, refunded: true, balance: this.walletBalance })
          : this.neutralBody(),
        replayed: false,
      };
    }

    this.records.set(recordKey, result);
    return result;
  }

  private neutralBody() {
    return Object.freeze({ success: true as const, refunded: false as const, balance: null });
  }

  evidence() {
    return {
      friendshipPresent: this.friendship !== null,
      refundClaims: Number(this.refundClaimed),
      walletBalance: this.walletBalance,
      walletWrites: this.walletWriteCount,
      ledgerWrites: this.ledgerWriteCount,
      removalOutboxes: Number(this.removalOutbox !== null),
      removalOutbox: this.removalOutbox,
    } as const;
  }
}

const neutral = { success: true, refunded: false, balance: null } as const;

describe("immutable requester refund ownership", () => {
  it.each([
    { firstActor: "A" as const, firstPath: "delete" as const, secondActor: "B" as const, secondPath: "delete" as const },
    { firstActor: "A" as const, firstPath: "delete" as const, secondActor: "B" as const, secondPath: "block" as const },
    { firstActor: "A" as const, firstPath: "block" as const, secondActor: "B" as const, secondPath: "delete" as const },
    { firstActor: "A" as const, firstPath: "block" as const, secondActor: "B" as const, secondPath: "block" as const },
    { firstActor: "B" as const, firstPath: "delete" as const, secondActor: "A" as const, secondPath: "delete" as const },
    { firstActor: "B" as const, firstPath: "delete" as const, secondActor: "A" as const, secondPath: "block" as const },
    { firstActor: "B" as const, firstPath: "block" as const, secondActor: "A" as const, secondPath: "delete" as const },
    { firstActor: "B" as const, firstPath: "block" as const, secondActor: "A" as const, secondPath: "block" as const },
  ])(
    "refunds A once when $firstActor $firstPath wins before $secondActor $secondPath",
    ({ firstActor, firstPath, secondActor, secondPath }) => {
      const model = new FriendshipRemovalModel();
      const first = model.mutate(firstActor, firstPath, "winner-key");
      const second = model.mutate(secondActor, secondPath, "loser-key");

      expect(first.status).toBe(200);
      expect(first.body).toEqual(firstActor === "A"
        ? { success: true, refunded: true, balance: 5 }
        : neutral);
      expect(second.body).toEqual(secondPath === "block"
        ? neutral
        : { code: "FRIENDSHIP_NOT_FOUND" });
      expect(model.evidence()).toEqual({
        friendshipPresent: false,
        refundClaims: 1,
        walletBalance: 5,
        walletWrites: 1,
        ledgerWrites: 1,
        removalOutboxes: 1,
        removalOutbox: {
          event_type: "friendship.removed",
          friendship_id: "friendship-A-B",
          requester_id: "A",
          addressee_id: "B",
          actor_id: firstActor,
          source: firstPath,
          refund_applied: true,
          refund_owner_id: "A",
        },
      });
    },
  );

  it("replays an addressee winner privately and cannot duplicate with another key", () => {
    const model = new FriendshipRemovalModel();
    const first = model.mutate("B", "block", "same-key");
    const replay = model.mutate("B", "block", "same-key");
    const differentKey = model.mutate("B", "block", "different-key");
    const requesterAfterWinner = model.mutate("A", "delete", "requester-key");

    expect(first).toEqual({ status: 200, body: neutral, replayed: false });
    expect(replay).toEqual({ status: 200, body: neutral, replayed: true });
    expect(differentKey).toEqual({ status: 200, body: neutral, replayed: false });
    expect(requesterAfterWinner.status).toBe(404);
    expect(Object.keys(first.body).sort()).toEqual(["balance", "refunded", "success"]);
    expect(first.body).not.toHaveProperty("refund_owner_id");
    expect(first.body).not.toHaveProperty("requester_id");
    expect(first.body).not.toHaveProperty("amount");
    expect(model.evidence()).toMatchObject({
      refundClaims: 1,
      walletBalance: 5,
      walletWrites: 1,
      ledgerWrites: 1,
      removalOutboxes: 1,
    });
  });

  it("removes accepted friendships without a refund or caller-visible balance", () => {
    const model = new FriendshipRemovalModel("accepted");

    expect(model.mutate("B", "delete", "accepted-key")).toEqual({
      status: 200,
      body: neutral,
      replayed: false,
    });
    expect(model.evidence()).toEqual({
      friendshipPresent: false,
      refundClaims: 0,
      walletBalance: 4,
      walletWrites: 0,
      ledgerWrites: 0,
      removalOutboxes: 1,
      removalOutbox: {
        event_type: "friendship.removed",
        friendship_id: "friendship-A-B",
        requester_id: "A",
        addressee_id: "B",
        actor_id: "B",
        source: "delete",
        refund_applied: false,
        refund_owner_id: null,
      },
    });
  });
});
