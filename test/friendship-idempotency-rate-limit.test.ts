import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requestMigration = readFileSync(
  "supabase/migrations/20260807131003_atomic_friend_request_idempotency.sql",
  "utf8",
);
const responseMigration = readFileSync(
  "supabase/migrations/20260807134834_atomic_friend_response_idempotency.sql",
  "utf8",
);
const blockMigration = readFileSync(
  "supabase/migrations/20260807141926_atomic_friend_removal_idempotency.sql",
  "utf8",
);
const blockRpcMigration = blockMigration.slice(
  blockMigration.indexOf("create or replace function public.block_user_idempotent"),
);
const durableWorkflowMigration = readFileSync(
  "supabase/migrations/20260729235452_durable_workflows.sql",
  "utf8",
);

type Operation = "friend_request:create" | "friend_request:respond" | "user:block";
type ModelResult = Readonly<{
  status: 200 | 409 | 429;
  body: Readonly<Record<string, unknown>>;
  retryAfterSeconds: number | null;
  replayed: boolean;
}>;

class DurableRateLimitModel {
  private readonly buckets = new Map<string, {
    startedAt: number;
    count: number;
    denied: Omit<ModelResult, "replayed"> | null;
  }>();
  private readonly records = new Map<string, { hash: string; result: ModelResult }>();
  private bucketWriteCount = 0;

  constructor(
    private readonly limits: Readonly<Record<Operation, number>>,
    private readonly windowSeconds = 60,
  ) {}

  claim(
    actor: string,
    operation: Operation,
    key: string,
    now: number,
    hash = `hash:${key}`,
    afterBucketLock?: () => void,
  ): ModelResult {
    const recordKey = `${actor}:${operation}:${key}`;
    const stored = this.records.get(recordKey);
    if (stored) {
      if (stored.hash !== hash) {
        return {
          status: 409,
          body: Object.freeze({ code: "IDEMPOTENCY_KEY_REUSED" }),
          retryAfterSeconds: null,
          replayed: false,
        };
      }
      return { ...stored.result, replayed: true };
    }

    const bucketKey = `${actor}:${operation}`;
    const limit = this.limits[operation];
    const previous = this.buckets.get(bucketKey);
    const expired = !previous || previous.startedAt + this.windowSeconds <= now;
    const bucket = expired
      ? { startedAt: now, count: 0, denied: null }
      : previous;
    if (!previous || expired) this.bucketWriteCount += 1;
    this.buckets.set(bucketKey, bucket);

    // Models the SQL's second lookup after the bucket lock.
    afterBucketLock?.();
    const afterLock = this.records.get(recordKey);
    if (afterLock) {
      if (afterLock.hash !== hash) {
        return {
          status: 409,
          body: Object.freeze({ code: "IDEMPOTENCY_KEY_REUSED" }),
          retryAfterSeconds: null,
          replayed: false,
        };
      }
      return { ...afterLock.result, replayed: true };
    }

    if (bucket.count >= limit) {
      if (!bucket.denied) {
        const resetAt = bucket.startedAt + this.windowSeconds;
        bucket.denied = {
          status: 429,
          body: Object.freeze({
            version: "v1",
            error: "Too many requests",
            message: "Too many requests",
            code: "RATE_LIMITED",
            request_id: null,
          }),
          retryAfterSeconds: Math.max(1, Math.ceil(resetAt - now)),
        };
        this.bucketWriteCount += 1;
      }
      return { ...bucket.denied, replayed: false };
    }

    bucket.count += 1;
    this.bucketWriteCount += 1;
    const result: ModelResult = {
      status: 200,
      body: Object.freeze({ success: true }),
      retryAfterSeconds: null,
      replayed: false,
    };
    this.records.set(recordKey, { hash, result });
    return result;
  }

  commitAllowedAfterCompetingInitialMiss(
    actor: string,
    operation: Operation,
    key: string,
    hash: string,
  ) {
    const bucket = this.buckets.get(`${actor}:${operation}`);
    if (!bucket) throw new Error("bucket lock was not acquired");
    bucket.count += 1;
    this.bucketWriteCount += 1;
    this.records.set(`${actor}:${operation}:${key}`, {
      hash,
      result: {
        status: 200,
        body: Object.freeze({ success: true }),
        retryAfterSeconds: null,
        replayed: false,
      },
    });
  }

  bucketCount(actor: string, operation: Operation) {
    return this.buckets.get(`${actor}:${operation}`)?.count ?? 0;
  }

  get bucketSize() {
    return this.buckets.size;
  }

  get recordSize() {
    return this.records.size;
  }

  get bucketWrites() {
    return this.bucketWriteCount;
  }

}

describe("transactional friendship idempotency rate limits", () => {
  it("defines one reusable, actor-cascaded bucket per actor and operation", () => {
    expect(requestMigration).toMatch(
      /create table if not exists public\.friendship_mutation_rate_limits \([\s\S]*primary key \(actor_id, operation\)/,
    );
    expect(requestMigration).toContain("references public.profiles(id) on delete cascade");
    expect(requestMigration).toContain(
      "operation in ('friend_request:create', 'friend_request:respond')",
    );
    expect(blockMigration).toContain(
      "operation in ('friend_request:create', 'friend_request:respond', 'user:block')",
    );
    expect(blockMigration).toContain(
      "friendship_mutation_rate_limits_denied_retry_after_seconds_check",
    );
    expect(blockMigration).toContain(
      "denied_retry_after_seconds between 1 and 86400",
    );
    expect(requestMigration).toContain("request_count between 0 and 61");
    expect(requestMigration).toContain("denied_response_body jsonb");
    expect(requestMigration).toContain("denied_retry_after_seconds integer");
    expect(requestMigration).toContain(
      "alter table public.friendship_mutation_rate_limits enable row level security",
    );
    expect(requestMigration).toMatch(
      /revoke all on public\.friendship_mutation_rate_limits\s+from public, anon, authenticated;/,
    );
    expect(durableWorkflowMigration).toContain(
      "on public.idempotency_records (expires_at)",
    );
    expect(durableWorkflowMigration).toMatch(
      /delete from public\.idempotency_records[\s\S]*where expires_at < now\(\)[\s\S]*limit greatest\(1, least\(p_limit, 5000\)\)/,
    );
  });

  it.each([
    ["create", requestMigration, "perform pg_catalog.pg_advisory_xact_lock"],
    ["respond", responseMigration, "select friendship.requester_id, friendship.addressee_id"],
    ["block", blockRpcMigration, "public.block_user_with_friendship_fence"],
  ])("looks up, bucket-locks, rechecks, then claims allowed %s keys", (_name, migration, businessMarker) => {
    const expiredKeyDelete = migration.indexOf("delete from public.idempotency_records record");
    const initialLookup = migration.indexOf("record.request_hash", expiredKeyDelete);
    const bucketLock = migration.indexOf("'friendship-rate:'", initialLookup);
    const bucketRead = migration.indexOf(
      "from public.friendship_mutation_rate_limits bucket",
      bucketLock,
    );
    const secondLookup = migration.indexOf("record.request_hash", bucketRead);
    const denial = migration.indexOf("if v_rate_count >= v_rate_limit then", secondLookup);
    const durableClaim = migration.indexOf("insert into public.idempotency_records", denial);
    const business = migration.indexOf(businessMarker, durableClaim);

    expect(expiredKeyDelete).toBeGreaterThan(-1);
    expect(initialLookup).toBeGreaterThan(expiredKeyDelete);
    expect(bucketLock).toBeGreaterThan(initialLookup);
    expect(bucketRead).toBeGreaterThan(bucketLock);
    expect(secondLookup).toBeGreaterThan(bucketRead);
    expect(denial).toBeGreaterThan(secondLookup);
    expect(durableClaim).toBeGreaterThan(denial);
    expect(business).toBeGreaterThan(durableClaim);
    expect(migration.match(/insert into public\.idempotency_records/g)).toHaveLength(1);
    expect(migration).toMatch(
      /pg_catalog\.pg_advisory_xact_lock\([\s\S]*'friendship-rate:' \|\| p_actor_id::text \|\| ':' \|\| p_operation/,
    );
    expect(migration).toContain("set request_count = bucket.request_count + 1");
  });

  it.each([requestMigration, responseMigration, blockRpcMigration])(
    "stores one deterministic bucket 429 without claiming rejected keys",
    (migration) => {
      const denial = migration.indexOf("if v_rate_count >= v_rate_limit then");
      const deniedReturn = migration.indexOf("'response_status', 429", denial);
      const durableClaim = migration.indexOf("insert into public.idempotency_records", deniedReturn);

      expect(deniedReturn).toBeGreaterThan(denial);
      expect(durableClaim).toBeGreaterThan(deniedReturn);
      expect(migration).toContain("denied_response_body = v_bucket_denied_body");
      expect(migration).toContain(
        "denied_retry_after_seconds = v_bucket_denied_retry_after_seconds",
      );
      expect(migration).toContain("'request_id', null");
      expect(migration).toContain("'retry_after_seconds', v_stored_retry_after_seconds");
      expect(migration).toContain(
        "'retry_after_seconds', v_bucket_denied_retry_after_seconds",
      );
      expect(migration).toContain("Rejected keys are deliberately unclaimed");
      expect(migration).toMatch(
        /with expired as \([\s\S]*record\.actor_id = p_actor_id[\s\S]*record\.operation = p_operation[\s\S]*limit 100[\s\S]*delete from public\.idempotency_records/,
      );
    },
  );

  it("keeps 100,000 active-window denied keys bounded before cleanup", () => {
    const model = new DurableRateLimitModel({
      "friend_request:create": 20,
      "friend_request:respond": 60,
      "user:block": 20,
    });
    const results = Array.from({ length: 100_000 }, (_, index) =>
      model.claim("actor-a", "friend_request:create", `key-${index}`, 1_000),
    );

    expect(results.filter((result) => result.status === 200)).toHaveLength(20);
    expect(results.filter((result) => result.status === 429)).toHaveLength(99_980);
    expect(model.bucketCount("actor-a", "friend_request:create")).toBe(20);
    expect(model.bucketSize).toBe(1);
    expect(model.recordSize).toBe(20);
    expect(model.bucketWrites).toBe(22);
    expect(new Set(
      results.filter((result) => result.status === 429)
        .map((result) => JSON.stringify([result.body, result.retryAfterSeconds])),
    ).size).toBe(1);
  });

  it("keeps 100,000 active-window block keys to 20 claims and one bounded bucket", () => {
    const model = new DurableRateLimitModel({
      "friend_request:create": 20,
      "friend_request:respond": 60,
      "user:block": 20,
    }, 86_400);
    const results = Array.from({ length: 100_000 }, (_, index) =>
      model.claim(
        "blocker-a",
        "user:block",
        `block-key-${index}`,
        10_000,
        `target-${index}`,
      ),
    );
    const denied = results.filter((result) => result.status === 429);

    expect(results.filter((result) => result.status === 200)).toHaveLength(20);
    expect(denied).toHaveLength(99_980);
    expect(model.bucketCount("blocker-a", "user:block")).toBe(20);
    expect(model.bucketSize).toBe(1);
    expect(model.recordSize).toBe(20);
    expect(model.bucketWrites).toBe(22);
    expect(new Set(denied.map((result) => JSON.stringify([
      result.body,
      result.retryAfterSeconds,
    ]))).size).toBe(1);
    expect(denied[0]).toMatchObject({
      status: 429,
      retryAfterSeconds: 86_400,
      replayed: false,
    });
  });

  it("allows the boundary, rechecks same-key winners, and rolls the window", () => {
    const model = new DurableRateLimitModel({
      "friend_request:create": 3,
      "friend_request:respond": 3,
      "user:block": 3,
    });
    model.claim("actor-a", "friend_request:create", "first", 2_000);
    model.claim("actor-a", "friend_request:create", "second", 2_000);

    const boundary = model.claim("actor-a", "friend_request:create", "boundary", 2_000);
    const boundaryReplay = model.claim(
      "actor-a",
      "friend_request:create",
      "boundary",
      2_001,
    );
    expect(boundary.status).toBe(200);
    expect(boundaryReplay).toMatchObject({ status: 200, replayed: true });
    expect(model.bucketCount("actor-a", "friend_request:create")).toBe(3);

    const rejected = model.claim("actor-a", "friend_request:create", "rejected", 2_005);
    const sameDeniedKey = model.claim(
      "actor-a",
      "friend_request:create",
      "rejected",
      2_020,
      "different-unclaimed-hash",
    );
    expect(rejected).toMatchObject({
      status: 429,
      retryAfterSeconds: 55,
      replayed: false,
    });
    expect(sameDeniedKey).toEqual(rejected);
    expect(model.bucketCount("actor-a", "friend_request:create")).toBe(3);
    expect(model.recordSize).toBe(3);

    const rolloverWinner = model.claim(
      "actor-a",
      "friend_request:create",
      "rejected",
      2_061,
      "different-unclaimed-hash",
    );
    expect(rolloverWinner).toMatchObject({ status: 200, replayed: false });
    expect(model.claim(
      "actor-a",
      "friend_request:create",
      "rejected",
      2_062,
      "original-hash",
    )).toMatchObject({ status: 409, replayed: false });
  });

  it("keeps denied block keys reusable after rollover and claimed keys target-bound", () => {
    const model = new DurableRateLimitModel({
      "friend_request:create": 1,
      "friend_request:respond": 1,
      "user:block": 1,
    }, 86_400);

    expect(model.claim("actor-a", "user:block", "allowed", 5_000, "target-a").status)
      .toBe(200);
    const denied = model.claim("actor-a", "user:block", "reusable", 5_100, "target-b");
    expect(denied).toMatchObject({ status: 429, retryAfterSeconds: 86_300 });
    expect(model.claim("actor-a", "user:block", "reusable", 5_200, "target-c"))
      .toEqual(denied);
    expect(model.recordSize).toBe(1);

    const rollover = model.claim("actor-a", "user:block", "reusable", 91_401, "target-c");
    expect(rollover).toMatchObject({ status: 200, replayed: false });
    expect(model.claim("actor-a", "user:block", "reusable", 91_402, "target-b"))
      .toMatchObject({ status: 409, replayed: false });
    expect(model.claim("actor-b", "user:block", "other-actor", 91_402, "target-c").status)
      .toBe(200);
    expect(model.bucketSize).toBe(2);
  });

  it.each(["friend_request:create", "user:block"] as const)(
    "rechecks a same-key %s winner after waiting for the bucket lock",
    (operation) => {
    const model = new DurableRateLimitModel({
      "friend_request:create": 20,
      "friend_request:respond": 60,
      "user:block": 20,
    });

    const result = model.claim(
      "actor-a",
      operation,
      "same-key",
      4_000,
      "same-hash",
      () => model.commitAllowedAfterCompetingInitialMiss(
        "actor-a",
        operation,
        "same-key",
        "same-hash",
      ),
    );

    expect(result).toMatchObject({ status: 200, replayed: true });
    expect(model.bucketCount("actor-a", operation)).toBe(1);
    expect(model.recordSize).toBe(1);
    },
  );

  it("isolates actors and operations into independent quota windows", () => {
    const model = new DurableRateLimitModel({
      "friend_request:create": 1,
      "friend_request:respond": 1,
      "user:block": 1,
    });

    expect(model.claim("actor-a", "friend_request:create", "a-create", 3_000).status).toBe(200);
    expect(model.claim("actor-a", "friend_request:respond", "a-respond", 3_000).status).toBe(200);
    expect(model.claim("actor-b", "friend_request:create", "b-create", 3_000).status).toBe(200);
    expect(model.claim("actor-a", "friend_request:create", "a-create-2", 3_000).status).toBe(429);
    expect(model.bucketSize).toBe(3);
  });
});
