import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";

function postgresBin() {
  if (process.env.POSTGRES_BIN) return process.env.POSTGRES_BIN;
  try { return execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim(); }
  catch { return "/opt/homebrew/opt/postgresql@17/bin"; }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(label, predicate, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}

export async function withLocalPostgres(work) {
  const bin = postgresBin();
  assert.match(execFileSync(`${bin}/postgres`, ["--version"], { encoding: "utf8" }), /PostgreSQL\)?\s+17\./);
  // Keep Unix socket paths short on both macOS and Linux runners.
  const temp = mkdtempSync("/tmp/ppcw-");
  const data = `${temp}/data`;
  const socket = `${temp}/socket`;
  const log = `${temp}/postgres.log`;
  mkdirSync(socket);
  const port = "55440";
  const sessions = new Set();
  let started = false;
  const run = (command, args, input = "") => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(new Error(`${command} exited ${code}: ${err || out}`)));
    child.stdin.end(input);
  });
  const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-h", socket, "-p", port, "-U", "postgres", "postgres"];
  const query = (sql) => run(`${bin}/psql`, [...args, "-c", sql]);
  function session(sql) {
    const child = spawn(`${bin}/psql`, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", exited = false, code = null;
    const entry = {
      get out() { return out; }, get err() { return err; }, get exited() { return exited; }, get code() { return code; },
      write(sql) { child.stdin.write(sql + "\n"); },
      finish(sql = "commit;") { if (!exited && !child.stdin.destroyed) child.stdin.end(sql + "\n\\q\n"); },
      kill() { child.kill("SIGTERM"); },
      async pid() { await until("backend PID", () => /^PID:\d+$/m.test(out) || exited); assert.equal(exited, false, err); return Number(out.match(/^PID:(\d+)$/m)[1]); },
      async wait() { await until("SQL session completion", () => exited); return code; },
    };
    sessions.add(entry);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error) => { err += error.message; });
    child.stdin.on("error", (error) => { if (!exited) err += error.message; });
    child.on("close", (value) => { exited = true; code = value; sessions.delete(entry); });
    child.stdin.write("select 'PID:'||pg_backend_pid();\n" + sql + "\n");
    return entry;
  }
  try {
    await run(`${bin}/initdb`, ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale"]);
    await run(`${bin}/pg_ctl`, ["-D", data, "-l", log, "-o", `-k ${socket} -p ${port} -c listen_addresses=''`, "-w", "start"]);
    started = true;
    await work({ query, session, until, async blockedBy(writer, holder) {
      await until("observed database lock wait", async () => (await query(`select wait_event_type='Lock' and ${holder}=any(pg_blocking_pids(pid)) from pg_stat_activity where pid=${writer}`)) === "t");
    } });
  } catch (error) {
    if (!started && existsSync(log)) error.message += "\n" + readFileSync(log, "utf8");
    throw error;
  } finally {
    for (const entry of sessions) if (!entry.exited) entry.finish("rollback;");
    const deadline = Date.now() + 1_000;
    while (sessions.size && Date.now() < deadline) await delay(20);
    for (const entry of sessions) entry.kill();
    if (started) await run(`${bin}/pg_ctl`, ["-D", data, "-m", "immediate", "-w", "stop"]);
    rmSync(temp, { recursive: true, force: true });
  }
}
