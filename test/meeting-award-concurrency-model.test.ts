import { describe, expect, it } from "vitest";

class MeetingAwardModel {
  private readonly attempts = new Map<string, { awarded: boolean; balance: number | null }>();
  private readonly meetings = new Set<string>();
  private readonly balances = new Map([["A", 3], ["B", 2]]);
  ledgerWrites = 0;

  record(actor: "A" | "B", peer: "A" | "B", key: string) {
    const attempt = `${actor}:${key}`;
    const replay = this.attempts.get(attempt);
    if (replay) return { ...replay, replayed: true };
    const pair = [actor, peer].sort().join(":");
    if (this.meetings.has(pair)) {
      const result = { awarded: false, balance: null };
      this.attempts.set(attempt, result);
      return { ...result, replayed: false };
    }
    this.meetings.add(pair);
    for (const user of [actor, peer]) {
      const old = this.balances.get(user) ?? 5;
      const balance = Math.min(old + 1, 5);
      this.balances.set(user, balance);
      if (balance > old) this.ledgerWrites += 1;
    }
    const result = { awarded: true, balance: this.balances.get(actor)! };
    this.attempts.set(attempt, result);
    return { ...result, replayed: false };
  }

  evidence() {
    return {
      meetings: this.meetings.size,
      attempts: this.attempts.size,
      balanceA: this.balances.get("A"),
      balanceB: this.balances.get("B"),
      ledgerWrites: this.ledgerWrites,
    };
  }
}

describe("opposite-participant meeting concurrency", () => {
  it.each([["A", "B"], ["B", "A"]] as const)(
    "%s wins while %s converges without a second award",
    (winner, loser) => {
      const model = new MeetingAwardModel();
      const first = model.record(winner, loser, "winner-key");
      const competing = model.record(loser, winner, "loser-key");
      const replay = model.record(winner, loser, "winner-key");

      expect(first).toMatchObject({ awarded: true, replayed: false });
      expect(competing).toEqual({ awarded: false, balance: null, replayed: false });
      expect(replay).toEqual({ ...first, replayed: true });
      expect(model.evidence()).toEqual({
        meetings: 1,
        attempts: 2,
        balanceA: 4,
        balanceB: 3,
        ledgerWrites: 2,
      });
    },
  );
});
