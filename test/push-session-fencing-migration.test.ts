import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260807132650_push_session_fencing.sql",
  "utf8",
);
const routeSource = readFileSync("src/app/api/profile/push-token/route.ts", "utf8");
const deliverySource = readFileSync("src/lib/push/send.ts", "utf8");
const rolloutGuide = readFileSync(
  "docs/production-baseline/recovery-and-compatibility.md",
  "utf8",
);

type SessionFence = {
  createdAt: string;
  sessionId: string;
};

function registrationWins(current: SessionFence | null, incoming: SessionFence) {
  if (!current) return true;
  if (incoming.createdAt !== current.createdAt) {
    return incoming.createdAt > current.createdAt;
  }
  return incoming.sessionId >= current.sessionId;
}

function revocationWins(current: SessionFence, requester: SessionFence) {
  return current.sessionId === requester.sessionId;
}

describe("push session fencing migration", () => {
  it("stores an indivisible authenticated-session ownership fence", () => {
    expect(migration).toContain("add column if not exists owner_session_id uuid");
    expect(migration).toContain("add column if not exists owner_session_created_at timestamptz");
    expect(migration).toContain("push_devices_owner_session_pair_check");
    expect(migration).toMatch(/owner_session_id is null and owner_session_created_at is null[\s\S]*owner_session_id is not null and owner_session_created_at is not null/);
  });

  it("derives generation from auth.sessions instead of caller-controlled time", () => {
    expect(migration).toMatch(/select auth_session\.created_at[\s\S]*from auth\.sessions as auth_session[\s\S]*auth_session\.id = p_session_id[\s\S]*auth_session\.user_id = p_user_id/);
    expect(migration).not.toMatch(/p_(iat|session_created_at|generation)/);
    expect(migration).toContain("raise exception 'Invalid authenticated session' using errcode = '22023'");
  });

  it("serializes token ownership and accepts only a monotonic generation with a deterministic tie", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock\([\s\S]*hashtextextended\(p_token, 0\)/);
    expect(migration).toMatch(/excluded\.owner_session_created_at > public\.push_devices\.owner_session_created_at/);
    expect(migration).toMatch(/excluded\.owner_session_created_at = public\.push_devices\.owner_session_created_at[\s\S]*excluded\.owner_session_id >= public\.push_devices\.owner_session_id/);

    const a = { createdAt: "2026-08-07T10:00:00.000Z", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const b = { createdAt: "2026-08-07T10:00:01.000Z", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
    expect(registrationWins(a, b)).toBe(true);
    expect(registrationWins(b, a)).toBe(false);
    expect(registrationWins(a, a)).toBe(true);
  });

  it("uses session UUID ordering when authenticated sessions share an equal creation time", () => {
    const lower = { createdAt: "2026-08-07T10:00:00.000Z", sessionId: "11111111-1111-4111-8111-111111111111" };
    const higher = { createdAt: lower.createdAt, sessionId: "22222222-2222-4222-8222-222222222222" };

    expect(registrationWins(lower, higher)).toBe(true);
    expect(registrationWins(higher, lower)).toBe(false);
  });

  it("makes a captured A delete harmless after B owns the token", () => {
    expect(migration).toMatch(/where user_id = p_user_id\s+and token = p_token\s+and owner_session_id = p_session_id/);

    const a = { createdAt: "2026-08-07T10:00:00.000Z", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const b = { createdAt: "2026-08-07T10:00:01.000Z", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
    expect(revocationWins(b, a)).toBe(false);
    expect(revocationWins(b, b)).toBe(true);
  });

  it("lets a reinstall register a different token without weakening the existing token fence", () => {
    const reinstall = { createdAt: "2026-08-07T10:00:02.000Z", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
    expect(registrationWins(null, reinstall)).toBe(true);
    expect(migration).toContain("on conflict (token) do update");
  });

  it("keeps both privileged RPCs service-only with an empty search path", () => {
    expect(migration).toMatch(/create or replace function public\.upsert_push_device_v2\([\s\S]*language plpgsql\s+security definer\s+set search_path = ''/);
    expect(migration).toMatch(/create or replace function public\.revoke_push_device_v2\([\s\S]*language plpgsql\s+security definer\s+set search_path = ''/);
    expect(migration).toMatch(/revoke all on function public\.upsert_push_device_v2\([\s\S]*from public, anon, authenticated;/);
    expect(migration).toMatch(/revoke all on function public\.revoke_push_device_v2\([\s\S]*from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.upsert_push_device_v2\([\s\S]*to service_role;/);
    expect(migration).toMatch(/grant execute on function public\.revoke_push_device_v2\([\s\S]*to service_role;/);
  });

  it("makes both v1 RPC signatures fail closed even for service_role", () => {
    const legacyUpsertStart = migration.indexOf("create or replace function public.upsert_push_device(");
    const legacyRevokeStart = migration.indexOf("create or replace function public.revoke_push_device(");
    const legacyRevokesStart = migration.indexOf("revoke all on function public.upsert_push_device(");
    const legacyUpsert = migration.slice(legacyUpsertStart, legacyRevokeStart);
    const legacyRevoke = migration.slice(legacyRevokeStart, legacyRevokesStart);

    expect(legacyUpsertStart).toBeGreaterThan(-1);
    expect(legacyRevokeStart).toBeGreaterThan(legacyUpsertStart);
    expect(legacyUpsert).toContain("raise exception 'Legacy push device mutation is disabled'");
    expect(legacyUpsert).toContain("errcode = '0A000'");
    expect(legacyUpsert).not.toContain("insert into public.push_devices");
    expect(legacyRevoke).toContain("raise exception 'Legacy push device mutation is disabled'");
    expect(legacyRevoke).not.toContain("update public.push_devices");
    expect(migration).toMatch(/revoke all on function public\.upsert_push_device\(uuid, text, text, text\)\s+from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/revoke all on function public\.revoke_push_device\(uuid, text\)\s+from public, anon, authenticated, service_role;/);
    expect(migration).not.toMatch(/grant execute on function public\.(upsert_push_device|revoke_push_device)\(/);
  });

  it("revokes pre-baseline fallback overloads and leaves no route path to a v1 mutation", () => {
    expect(migration).toContain("proc.proname in ('upsert_push_token', 'delete_push_token')");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(routeSource).not.toMatch(/rpc\("(upsert_push_device|revoke_push_device|upsert_push_token|delete_push_token)"/);
    expect(routeSource).toContain('rpc("upsert_push_device_v2"');
    expect(routeSource).toContain('rpc("revoke_push_device_v2"');
  });

  it("fences provider-invalid cleanup to the registration row that was actually sent", () => {
    expect(deliverySource).not.toMatch(/rpc\("(upsert_push_device|revoke_push_device)"/);
    expect(deliverySource).toContain("owner_session_id, last_registered_at");
    expect(deliverySource).toContain('.eq("last_registered_at", entry.last_registered_at)');
    expect(deliverySource).toContain('.eq("owner_session_id", entry.owner_session_id)');
    expect(deliverySource).toContain('.is("owner_session_id", null)');
  });

  it("documents the migration-first fail-closed interval for old API instances", () => {
    expect(rolloutGuide).toContain("Old route instances therefore fail push registration and");
    expect(rolloutGuide).toContain("until the v2 route deployment completes");
    expect(rolloutGuide).toContain("do not roll the API back to a v1-calling deployment afterward");
  });
});
