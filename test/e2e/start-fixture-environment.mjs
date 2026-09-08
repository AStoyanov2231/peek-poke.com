import { spawn } from "node:child_process";

const supabasePort = Number(process.env.E2E_SUPABASE_PORT ?? 54321);
if (!Number.isInteger(supabasePort) || supabasePort < 1024 || supabasePort > 65535) {
  throw new Error("E2E_SUPABASE_PORT must be an integer between 1024 and 65535.");
}

const env = {
  ...process.env,
  E2E_SUPABASE_PORT: String(supabasePort),
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
  STRIPE_SECRET_KEY: "sk_test_fixture_only",
  STRIPE_WEBHOOK_SECRET: "fixture-only",
  STRIPE_PREMIUM_PRICE_ID: "",
  TURN_SHARED_SECRET: "",
  TURN_URLS: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  KV_REST_API_URL: "",
  KV_REST_API_TOKEN: "",
  CRON_SECRET: "fixture-only",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3001",
};
const fixture = spawn(process.execPath, ["test/e2e/fixture-supabase-server.mjs"], { env, stdio: "inherit" });
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", "3001"], { env, stdio: "inherit" });
function stop() { fixture.kill(); next.kill(); }
process.on("SIGTERM", stop); process.on("SIGINT", stop);
fixture.on("error", stop);
fixture.on("exit", () => next.kill());
next.on("error", stop);
next.on("exit", (code) => { fixture.kill(); process.exit(code ?? 1); });
