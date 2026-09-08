export const PRODUCTION_SUPABASE_PROJECT_REF = "ttojvnwpnpuhkyjncwxn";
const PRODUCTION_APP_HOSTS = new Set(["peek-poke.com", "www.peek-poke.com"]);
const PRODUCTION_DEPLOYED_APP_ORIGIN = "https://www.peek-poke.com";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Environment = Record<string, string | undefined>;

export type SupabaseIntegrationTarget =
  | { requested: false; configured: false; reason: null }
  | {
      requested: true;
      configured: true;
      reason: null;
      supabaseUrl: string;
      appUrl: string | null;
      targetRef: string | null;
      hosted: boolean;
    }
  | { requested: true; configured: false; reason: string };

function parseUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.origin === value.replace(/\/+$/, "") ? parsed : null;
  } catch {
    return null;
  }
}

function isLoopback(url: URL) {
  return ["http:", "https:"].includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname);
}

function hostedRef(url: URL) {
  const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname);
  return match?.[1].toLowerCase() ?? null;
}

/**
 * Resolves a destructive integration-test target. The production project is
 * denied by default and requires an additional explicit environment opt-in.
 */
export function resolveSupabaseIntegrationTarget(
  environment: Environment,
  options: { requireLocalAppUrl: boolean },
): SupabaseIntegrationTarget {
  const rawUrl = environment.SUPABASE_TEST_URL;
  const rawAppUrl = environment.SUPABASE_TEST_APP_URL;
  const targetRef = environment.SUPABASE_TEST_TARGET?.toLowerCase() ?? null;
  const isolatedOptIn = environment.SUPABASE_TEST_ISOLATED === "true";
  const productionOptIn = environment.SUPABASE_TEST_ALLOW_PRODUCTION === "1";
  const deployedAppOptIn = environment.SUPABASE_TEST_ALLOW_DEPLOYED_APP === "1";
  const requested = Boolean(
    rawUrl
      || rawAppUrl
      || targetRef
      || environment.SUPABASE_TEST_ISOLATED
      || environment.SUPABASE_TEST_ALLOW_PRODUCTION
      || environment.SUPABASE_TEST_SERVICE_ROLE_KEY
      || environment.SUPABASE_TEST_ANON_KEY,
  );
  if (!requested) return { requested: false, configured: false, reason: null };

  const supabaseUrl = parseUrl(rawUrl);
  const appUrl = parseUrl(rawAppUrl);
  if (!supabaseUrl)
    return { requested: true, configured: false, reason: "SUPABASE_TEST_URL must be an absolute origin" };
  const deployedAppAllowed = Boolean(
    appUrl?.origin === PRODUCTION_DEPLOYED_APP_ORIGIN
    && supabaseUrl.origin === `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
    && targetRef === PRODUCTION_SUPABASE_PROJECT_REF
    && isolatedOptIn
    && productionOptIn
    && deployedAppOptIn,
  );
  if (appUrl && PRODUCTION_APP_HOSTS.has(appUrl.hostname) && !deployedAppAllowed)
    return { requested: true, configured: false, reason: "SUPABASE_TEST_APP_URL may target the production app only with every deployed verification opt-in" };
  if (targetRef === PRODUCTION_SUPABASE_PROJECT_REF && !productionOptIn)
    return { requested: true, configured: false, reason: "the production project requires SUPABASE_TEST_ALLOW_PRODUCTION=1" };

  if (options.requireLocalAppUrl && (!appUrl || (!isLoopback(appUrl) && !deployedAppAllowed)))
    return { requested: true, configured: false, reason: "browser/API integration requires a loopback SUPABASE_TEST_APP_URL" };

  if (isLoopback(supabaseUrl)) {
    return {
      requested: true,
      configured: true,
      reason: null,
      supabaseUrl: supabaseUrl.origin,
      appUrl: appUrl?.origin ?? null,
      targetRef: null,
      hosted: false,
    };
  }

  const ref = hostedRef(supabaseUrl);
  if (!ref || supabaseUrl.protocol !== "https:")
    return { requested: true, configured: false, reason: "SUPABASE_TEST_URL must be loopback or an exact https isolated-project Supabase origin" };
  if (ref === PRODUCTION_SUPABASE_PROJECT_REF && !productionOptIn)
    return { requested: true, configured: false, reason: "the production project requires SUPABASE_TEST_ALLOW_PRODUCTION=1" };
  if (!targetRef || targetRef !== ref || !isolatedOptIn)
    return { requested: true, configured: false, reason: "hosted integration requires matching SUPABASE_TEST_TARGET and SUPABASE_TEST_ISOLATED=true" };

  return {
    requested: true,
    configured: true,
    reason: null,
    supabaseUrl: supabaseUrl.origin,
    appUrl: appUrl?.origin ?? null,
    targetRef: ref,
    hosted: true,
  };
}

export function requireSupabaseIntegrationTarget(
  target: SupabaseIntegrationTarget,
  requiredEnvironment: Environment,
  requiredKeys: string[],
  suiteName: string,
) {
  if (!target.configured)
    throw new Error(`${suiteName} requires an approved isolated target: ${target.reason ?? "configuration is unset"}.`);
  const missing = requiredKeys.filter((key) => !requiredEnvironment[key]);
  if (missing.length > 0)
    throw new Error(`${suiteName} requires complete credentials: ${missing.join(", ")}.`);
}
