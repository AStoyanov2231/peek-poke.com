import { spawn } from "node:child_process";

const env = {
  ...process.env,
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
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3001",
};
const fixture = spawn(process.execPath, ["test/e2e/fixture-supabase-server.mjs"], { env, stdio: "inherit" });
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3001"], { env, stdio: "inherit" });
function stop() { fixture.kill(); next.kill(); }
process.on("SIGTERM", stop); process.on("SIGINT", stop);
next.on("exit", (code) => { fixture.kill(); process.exit(code ?? 1); });
