import { createServer } from "node:http";

const port = Number(process.env.E2E_SUPABASE_PORT ?? 54321);
const user = { id: "11111111-1111-4111-8111-111111111111", email: "e2e@peek-poke.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const token = [Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString("base64url"), Buffer.from(JSON.stringify({sub:user.id,aud:"authenticated",role:"authenticated",exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})).toString("base64url"), "fixture"].join(".");
const session = { access_token: token, refresh_token: "e2e-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const send = (res, body, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
let onboardingCompleted = true;
let ageAdmission = {
  status: "adult",
  decided_at: "2026-09-08T00:00:00.000Z",
};

function admission(status) {
  return {
    status,
    decided_at: status === "pending" ? null : "2026-09-08T00:00:00.000Z",
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/__test/onboarding" && req.method === "POST") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    onboardingCompleted = JSON.parse(raw).completed === true;
    return send(res, { completed: onboardingCompleted });
  }
  if (url.pathname === "/__test/age-admission" && req.method === "POST") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (!["pending", "adult", "blocked"].includes(body.status)) {
      return send(res, { error: "invalid admission fixture state" }, 400);
    }
    ageAdmission = admission(body.status);
    return send(res, ageAdmission);
  }
  if (url.pathname === "/auth/v1/token" && req.method === "POST") return send(res, session);
  if (url.pathname === "/auth/v1/recover" && req.method === "POST") return send(res, {});
  if (url.pathname === "/auth/v1/user") return send(res, user);
  if (url.pathname.endsWith("/rpc/ensure_auth_profile_with_default_role")) return send(res, { auth_user_id: user.id, created: false, deleted_at: null, id: user.id, onboarding_completed: onboardingCompleted, user_role_assigned: true });
  if (url.pathname.endsWith("/rpc/get_user_roles")) return send(res, ["user"]);
  if (url.pathname.endsWith("/rpc/read_account_age_admission_v1")) return send(res, ageAdmission);
  if (url.pathname.endsWith("/rpc/record_account_age_admission_v1")) {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const { p_is_adult: isAdult } = JSON.parse(raw);
    if (ageAdmission.status === "pending") ageAdmission = admission(isAdult === true ? "adult" : "blocked");
    return send(res, ageAdmission);
  }
  if (url.pathname.endsWith("/rpc/get_pokes")) return send(res, { received: [], sent: [] });
  if (url.pathname.endsWith("/rpc/list_plans")) return send(res, { plans: [] });
  if (url.pathname.endsWith("/rpc/plan_public_preview_v1")) {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const { p_token: shareToken } = JSON.parse(raw);
    if (shareToken === "u".repeat(43)) return send(res, { message: "Test-only service outage" }, 503);
    if (shareToken !== "a".repeat(43)) return send(res, { error: "NOT_FOUND" });
    return send(res, { plan: { id: "44444444-4444-4444-8444-444444444444", activity: "Coffee & a walk", title: null, starts_at: new Date(Date.now() + 3_600_000).toISOString(), place_text: "The café by the park", participant_limit: 4, member_count: 1 }, can_join: true });
  }
  if (url.pathname.startsWith("/rest/v1/profiles")) return send(res, req.headers.accept?.includes("vnd.pgrst.object") ? { id: user.id, deleted_at: null, onboarding_completed: onboardingCompleted } : [{ id: user.id, deleted_at: null, onboarding_completed: onboardingCompleted }]);
  if (url.pathname.startsWith("/rest/v1/")) return send(res, []);
  return send(res, { message: "fixture endpoint not implemented", path: url.pathname }, 404);
}).listen(port, "127.0.0.1", () => console.log(`E2E fixture Supabase listening on ${port}`));
