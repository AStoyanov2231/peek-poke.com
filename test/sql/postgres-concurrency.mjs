import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
function discoverPostgresBin() {
  if (process.env.POSTGRES_BIN) return process.env.POSTGRES_BIN;
  try {
    return execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  } catch {
    return "/opt/homebrew/opt/postgresql@17/bin";
  }
}

const postgresBin = discoverPostgresBin();
const initdb = `${postgresBin}/initdb`;
const pgCtl = `${postgresBin}/pg_ctl`;
const psql = `${postgresBin}/psql`;
for (const binary of [initdb, pgCtl, psql, `${postgresBin}/postgres`]) {
  assert.ok(existsSync(binary), `PostgreSQL binary not found: ${binary}. Set POSTGRES_BIN to a PostgreSQL 17 bin directory.`);
}
const postgresVersion = execFileSync(`${postgresBin}/postgres`, ["--version"], { encoding: "utf8" });
assert.match(postgresVersion, /PostgreSQL\)?\s+17\./, `PostgreSQL 17 is required, received: ${postgresVersion.trim()}`);
for (const filename of readdirSync(resolve(root, "supabase/migrations"))) {
  if (filename <= "20260908121358_account_erasure_product_social_records.sql") continue;
  const migration = readFileSync(resolve(root, "supabase/migrations", filename), "utf8");
  assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function\s+public\.(?:purge_erased_account_product_social_records|reject_tombstoned_product_social_profile|purge_stale_user_locations)\s*\(/i, `${filename} replaces a concurrency-tested function; update this harness to the latest definition`);
}
let tempRoot;
let dataDir;
let socketDir;
let serverLog;
const port = 55439;
const retentionMigration = readFileSync(resolve(root, "supabase/migrations/20260908113454_privacy_location_retention.sql"), "utf8");
const erasureMigration = readFileSync(resolve(root, "supabase/migrations/20260908121358_account_erasure_product_social_records.sql"), "utf8");

function run(command, args, input = "") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else {
        const log = command === pgCtl && existsSync(serverLog) ? `\n${readFileSync(serverLog, "utf8")}` : "";
        reject(new Error(`${command} exited ${code}: ${stderr || stdout}${log}`));
      }
    });
    child.stdin.end(input);
  });
}

function sqlArgs() {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-h", socketDir, "-p", String(port), "postgres"];
}

async function query(sql) {
  return (await run(psql, [...sqlArgs(), "-c", sql])).stdout.trim();
}

function extractFunction(source, name) {
  const match = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name.replaceAll("_", "_")}\\([^]*?\\$\\$;`, "i").exec(source);
  assert.ok(match, `missing current function definition: ${name}`);
  return match[0];
}

const sessions = new Set();

function startSession(initialSql) {
  const child = spawn(psql, sqlArgs(), { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let exited = false;
  let exitCode = null;
  let session;
  child.stdout.on("data", (value) => { stdout += value; });
  child.stderr.on("data", (value) => { stderr += value; });
  child.on("close", (code) => { exited = true; exitCode = code; sessions.delete(session); });
  child.stdin.write(initialSql);
  session = {
    child,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    get exited() { return exited; },
    get exitCode() { return exitCode; },
    finish(sql) { child.stdin.end(`${sql}\n\\q\n`); },
  };
  sessions.add(session);
  return session;
}

async function stopSessions() {
  for (const session of sessions) {
    if (!session.exited) session.child.stdin.end("ROLLBACK;\n\\q\n");
  }
  const until = Date.now() + 1_000;
  while (sessions.size > 0 && Date.now() < until) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  for (const session of sessions) session.child.kill("SIGTERM");
}

async function waitFor(description, predicate, timeoutMs = 5_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function sessionPid(session) {
  await waitFor("session backend PID", async () => /^\d+$/m.test(session.stdout));
  return Number(session.stdout.match(/^\d+$/m)[0]);
}

async function waitForExit(session) {
  await waitFor("psql session exit", async () => session.exited);
  return session.exitCode;
}

async function waitForLock(blockedPid, blockingPid) {
  let lastState = "unobserved";
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    lastState = await query(`
      select coalesce(wait_event_type, 'none') || ':' || coalesce(wait_event, 'none') || ':' || pg_blocking_pids(pid)::text
      from pg_stat_activity
      where pid = ${blockedPid}
    `);
    if (lastState.startsWith("Lock:") && lastState.includes(`{${blockingPid}}`)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`timed out waiting for lock wait from ${blockedPid} to ${blockingPid}: ${lastState}`);
}

async function installFixture() {
  await query(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, deleted_at timestamptz);
    CREATE TABLE public.outbox_events(event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE TABLE public.user_availabilities(user_id uuid PRIMARY KEY);
    CREATE TABLE public.pokes(sender_id uuid NOT NULL, recipient_id uuid NOT NULL);
    CREATE TABLE public.social_idempotency_records(actor_id uuid, response jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE TABLE public.idempotency_records(actor_id uuid, response_body jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE TABLE public.plans(id uuid PRIMARY KEY, owner_id uuid);
    CREATE TABLE public.plan_members(plan_id uuid, user_id uuid);
    CREATE TABLE public.plan_share_tokens(created_by uuid);
    CREATE TABLE public.plan_join_idempotency(actor_id uuid, response_body jsonb NOT NULL DEFAULT '{}'::jsonb);
    CREATE TABLE public.plan_create_idempotency(actor_id uuid);
    CREATE TABLE public.meetup_acknowledgements(user_a_id uuid, user_b_id uuid);
    CREATE TABLE public.plan_meetup_acknowledgements(user_a_id uuid, user_b_id uuid);
    CREATE TABLE public.discovery_preferences(user_id uuid);
    CREATE TABLE public.product_first_activations(user_id uuid);
    CREATE TABLE public.product_activity_days(user_id uuid);
    CREATE TABLE public.product_discovery_daily_activity(user_id uuid);
    CREATE TABLE public.user_locations(user_id uuid PRIMARY KEY, updated_at timestamptz NOT NULL);
  `);
  await query(extractFunction(retentionMigration, "purge_stale_user_locations"));
  await query(extractFunction(erasureMigration, "purge_erased_account_product_social_records"));
  await query(extractFunction(erasureMigration, "erase_product_social_records_on_profile_tombstone"));
  await query(extractFunction(erasureMigration, "reject_tombstoned_product_social_profile"));
  await query(`
    CREATE TRIGGER erase_product_social_records_on_tombstone
    BEFORE UPDATE OF deleted_at ON public.profiles
    FOR EACH ROW
    WHEN (old.deleted_at IS NULL AND new.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.erase_product_social_records_on_profile_tombstone();
    CREATE TRIGGER product_social_active_availability_profile
    BEFORE INSERT OR UPDATE ON public.user_availabilities
    FOR EACH ROW EXECUTE FUNCTION public.reject_tombstoned_product_social_profile('user_id');
  `);
}

async function writerBeforeErasure() {
  const userId = "10000000-0000-4000-8000-000000000001";
  await query(`INSERT INTO public.profiles(id) VALUES('${userId}')`);
  const writer = startSession(`BEGIN;\nSELECT pg_backend_pid();\nINSERT INTO public.user_availabilities(user_id) VALUES('${userId}');\nSELECT 'writer_ready';\n`);
  const writerPid = await sessionPid(writer);
  await waitFor("writer availability lock", async () => writer.stdout.includes("writer_ready"));
  const eraser = startSession(`BEGIN;\nSELECT pg_backend_pid();\nUPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id='${userId}';\nCOMMIT;\n\\q\n`);
  const eraserPid = await sessionPid(eraser);
  await waitForLock(eraserPid, writerPid);
  writer.finish("COMMIT;");
  assert.equal(await waitForExit(writer), 0);
  assert.equal(await waitForExit(eraser), 0);
  assert.equal(await query(`SELECT count(*) FROM public.user_availabilities WHERE user_id='${userId}'`), "0", "erasure must purge a writer's committed availability");
  assert.equal(await query(`SELECT (deleted_at IS NOT NULL)::text FROM public.profiles WHERE id='${userId}'`), "true");
}

async function erasureBeforeWriter() {
  const userId = "10000000-0000-4000-8000-000000000002";
  await query(`INSERT INTO public.profiles(id) VALUES('${userId}')`);
  const eraser = startSession(`BEGIN;\nSELECT pg_backend_pid();\nUPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id='${userId}';\nSELECT 'eraser_ready';\n`);
  const eraserPid = await sessionPid(eraser);
  await waitFor("tombstone update completion", async () => eraser.stdout.includes("eraser_ready"));
  const writer = startSession(`BEGIN;\nSELECT pg_backend_pid();\nINSERT INTO public.user_availabilities(user_id) VALUES('${userId}');\nCOMMIT;\n\\q\n`);
  const writerPid = await sessionPid(writer);
  await waitForLock(writerPid, eraserPid);
  eraser.finish("COMMIT;");
  assert.equal(await waitForExit(eraser), 0);
  assert.notEqual(await waitForExit(writer), 0, "a writer released after the tombstone must fail closed");
  assert.match(writer.stderr, /cannot write product-social data for a deleted account/);
  assert.equal(await query(`SELECT count(*) FROM public.user_availabilities WHERE user_id='${userId}'`), "0", "a stale writer must not resurrect availability");
}

async function purgeBatching() {
  await query(`
    INSERT INTO public.user_locations(user_id,updated_at)
    SELECT ('20000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid, clock_timestamp() - interval '20 minutes'
    FROM generate_series(1, 2000) item;
    INSERT INTO public.user_locations(user_id,updated_at)
    VALUES('20000000-0000-4000-8000-000000009999',clock_timestamp());
  `);
  const locker = startSession(`BEGIN;\nSELECT pg_backend_pid();\nWITH locked AS MATERIALIZED (SELECT user_id FROM public.user_locations WHERE updated_at < clock_timestamp() - interval '10 minutes' ORDER BY user_id LIMIT 250 FOR UPDATE) SELECT count(*) FROM locked;\n`);
  await sessionPid(locker);
  await waitFor("locked stale-location batch", async () => locker.stdout.trim().split(/\s+/).includes("250"));
  assert.equal(await query("SELECT public.purge_stale_user_locations(1000)"), "1000", "purge must cap an unlocked concurrent batch at 1000");
  locker.finish("COMMIT;");
  assert.equal(await waitForExit(locker), 0);
  assert.equal(await query("SELECT public.purge_stale_user_locations(1000)"), "1000", "a later batch must purge the previously locked rows without overlap");
  assert.equal(await query("SELECT count(*) FROM public.user_locations WHERE updated_at < clock_timestamp() - interval '10 minutes'"), "0");
  assert.equal(await query("SELECT count(*) FROM public.user_locations WHERE updated_at >= clock_timestamp() - interval '10 minutes'"), "1", "fresh locations remain untouched");
}

let started = false;
try {
  tempRoot = mkdtempSync("/tmp/ppc-");
  dataDir = resolve(tempRoot, "data");
  socketDir = resolve(tempRoot, "socket");
  serverLog = resolve(tempRoot, "postgres.log");
  mkdirSync(socketDir, { mode: 0o700 });
  await run(initdb, ["-D", dataDir, "--no-locale", "--encoding=UTF8"]);
  await run(pgCtl, ["-D", dataDir, "-l", serverLog, "-o", `-k '${socketDir}' -p ${port} -c listen_addresses=''`, "-w", "start"]);
  started = true;
  await installFixture();
  await writerBeforeErasure();
  await erasureBeforeWriter();
  await purgeBatching();
  process.stdout.write("PostgreSQL concurrency validation passed: lock barriers, tombstone ordering, and SKIP LOCKED bounded purge\n");
} finally {
  await stopSessions();
  if (started) {
    try { await run(pgCtl, ["-D", dataDir, "-m", "immediate", "stop"]); } catch {}
  }
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
}
