import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseSync, loadModule } from "@libpg-query/parser";

const migrationPath = "supabase/migrations/20260807215540_durable_call_signaling.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("durable call signaling migration", () => {
  beforeAll(async () => {
    await loadModule();
  });

  it("parses with the real PostgreSQL 17.6 grammar", () => {
    expect(() => parseSync(sql)).not.toThrow();
    expect(parseSync(sql).stmts.length).toBeGreaterThan(20);
  });

  it("keeps durable call state server-only and removes client call broadcasts", () => {
    expect(sql).toContain("alter table public.call_sessions enable row level security");
    expect(sql).toContain("alter table public.call_signal_commands enable row level security");
    expect(sql).toContain("revoke all on public.call_sessions from public, anon, authenticated");
    expect(sql).toContain("revoke all on public.call_signal_commands from public, anon, authenticated");
    expect(sql).toContain("revoke insert, update, delete on realtime.messages from anon, authenticated");
    expect(sql).not.toMatch(/create policy[\s\S]*for insert[\s\S]*call:%/i);
  });

  it("uses fail-closed definer functions with replay and transition guards", () => {
    expect(sql.match(/security definer\s+set search_path = ''/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("v_command.payload_hash <> p_payload_hash");
    expect(sql).toContain("v_command.expires_at <= now()");
    expect(sql).toContain("p_event_type = 'offer'");
    expect(sql).toContain("p_actor_id <> v_session.caller_id");
    expect(sql).toContain("p_event_type = 'answer'");
    expect(sql).toContain("p_actor_id <> v_session.callee_id");
    expect(sql).toContain("A participant is already in a call");
    expect(sql).toContain("p_event_type = 'heartbeat'");
    expect(sql).toContain("v_session.expires_at := now() + interval '90 seconds'");
    expect(sql).toContain("public.user_blocks");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("limit 100");
    expect(sql).toContain("call_sessions_terminal_cleanup_idx");
  });

  it("allows reject only while ringing while preserving exact command replay", () => {
    const advance = sql.slice(
      sql.indexOf("create or replace function public.advance_call_session"),
      sql.indexOf("create or replace function public.recover_cancel_call_session"),
    );
    const replay = advance.slice(
      advance.indexOf("select command.* into v_command"),
      advance.indexOf("else\n    if v_session.expires_at <= now()"),
    );
    const reject = advance.slice(
      advance.indexOf("elsif p_event_type = 'reject'"),
      advance.indexOf("elsif p_event_type = 'cancel'"),
    );
    const end = advance.slice(
      advance.indexOf("elsif p_event_type = 'end'"),
      advance.indexOf("v_session.last_sequence := v_session.last_sequence + 1"),
    );

    expect(replay).toContain("v_replayed := true");
    expect(replay).toContain("v_command.event_type <> p_event_type");
    expect(reject).toContain("p_actor_id <> v_session.callee_id");
    expect(reject).toContain("v_session.state <> 'invited'");
    expect(reject).not.toContain("'accepted'");
    expect(end).toContain("v_session.state not in ('accepted', 'negotiating', 'connected')");
    expect(end).toContain("v_session.state := 'ended'");
  });

  it("binds capability-free invite recovery to the caller and exact original durable invite", () => {
    const recovery = sql.slice(
      sql.indexOf("create or replace function public.recover_cancel_call_session"),
      sql.indexOf("create or replace function public.authorize_call_invite_delivery"),
    );
    expect(recovery).toContain("v_session.caller_id <> p_actor_id");
    expect(recovery).toContain("command.call_id = p_call_id and command.command_id = p_invite_command_id");
    expect(recovery).toContain("v_invite.event_type <> 'invite'");
    expect(recovery).toContain("v_invite.sender_id <> v_session.caller_id");
    expect(recovery).toContain("v_invite.recipient_id <> v_session.callee_id");
    expect(recovery).toContain("v_invite.payload_hash <> p_invite_payload_hash");
    expect(recovery).toContain("v_command.event_type <> 'cancel'");
    expect(recovery.indexOf("command.command_id = p_command_id")).toBeLessThan(
      recovery.indexOf("command.command_id = p_invite_command_id"),
    );
    expect(recovery).toContain("v_replayed := true");
    expect(recovery).toContain("v_session.state not in ('invited', 'accepted')");
    expect(recovery).toContain("v_session.expires_at := now()");
    expect(recovery).not.toContain("p_capability");
    expect(sql).toContain("revoke all on function public.recover_cancel_call_session(uuid, uuid, uuid, uuid, uuid, text, text)");
    expect(sql).toContain("grant execute on function public.recover_cancel_call_session(uuid, uuid, uuid, uuid, uuid, text, text)");
  });

  it("atomically persists the invite outbox and exposes only service RPC execution", () => {
    expect(sql).toContain("insert into public.outbox_events");
    expect(sql).toContain("'call.invite', 'call', p_call_id");
    expect(sql).toContain("on conflict (event_type, aggregate_id) do nothing");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });

  it("re-authorizes stale invite delivery against every mutable security boundary", () => {
    const delivery = sql.slice(
      sql.indexOf("create or replace function public.authorize_call_invite_delivery"),
      sql.indexOf("revoke all on function public.begin_call_session"),
    );
    expect(delivery).toContain("v_session.state <> 'invited'");
    expect(delivery).toContain("v_session.expires_at <= now()");
    expect(delivery).toContain("v_session.thread_id <> p_thread_id");
    expect(delivery).toContain("v_session.caller_id <> p_caller_id");
    expect(delivery).toContain("v_session.callee_id <> p_callee_id");
    expect(delivery).toContain("caller.deleted_at is null and caller.onboarding_completed is true");
    expect(delivery).toContain("callee.deleted_at is null and callee.onboarding_completed is true");
    expect(delivery).toContain("from public.dm_thread_members member");
    expect(delivery).toContain(") = 2");
    expect(delivery).toContain("block.blocker_id = p_caller_id and block.blocked_id = p_callee_id");
    expect(delivery).toContain("block.blocker_id = p_callee_id and block.blocked_id = p_caller_id");
    expect(sql).toContain("revoke all on function public.authorize_call_invite_delivery(uuid, uuid, uuid, uuid)");
    expect(sql).toContain("grant execute on function public.authorize_call_invite_delivery(uuid, uuid, uuid, uuid)");
  });

  it("terminalizes calls transactionally for block, profile, and member changes", () => {
    expect(sql).toContain("create trigger terminate_calls_after_block");
    expect(sql).toContain("after insert on public.user_blocks");
    expect(sql).toContain("create trigger terminate_calls_for_inactive_profile");
    expect(sql).toContain("before update of deleted_at, onboarding_completed on public.profiles");
    expect(sql).toContain("create trigger terminate_calls_for_removed_thread_member");
    expect(sql).toContain("before delete on public.dm_thread_members");
    expect(sql.match(/set state = 'ended', expires_at = now\(\), updated_at = now\(\)/g)?.length)
      .toBeGreaterThanOrEqual(3);
  });

  it("uses a consistent call-id, thread, ordered-user, row lock hierarchy", () => {
    const advance = sql.slice(
      sql.indexOf("create or replace function public.advance_call_session"),
      sql.indexOf("create or replace function public.authorize_call_invite_delivery"),
    );
    expect(advance.indexOf("hashtextextended(p_call_id::text")).toBeLessThan(
      advance.indexOf("'call-thread:'"),
    );
    expect(advance.indexOf("'call-thread:'")).toBeLessThan(advance.indexOf("'call-user:'"));
    expect(advance.indexOf("'call-user:'")).toBeLessThan(advance.indexOf("for update"));

    const recovery = sql.slice(
      sql.indexOf("create or replace function public.recover_cancel_call_session"),
      sql.indexOf("create or replace function public.authorize_call_invite_delivery"),
    );
    expect(recovery.indexOf("hashtextextended(p_call_id::text")).toBeLessThan(
      recovery.indexOf("'call-thread:'"),
    );
    expect(recovery.indexOf("'call-thread:'")).toBeLessThan(recovery.indexOf("'call-user:'"));
    expect(recovery.indexOf("'call-user:'")).toBeLessThan(recovery.indexOf("for update"));
  });
});
