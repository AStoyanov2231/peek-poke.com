export const fixtureSupabasePort = Number(process.env.E2E_SUPABASE_PORT ?? 54321);

if (!Number.isInteger(fixtureSupabasePort) || fixtureSupabasePort < 1024 || fixtureSupabasePort > 65535) {
  throw new Error("E2E_SUPABASE_PORT must be an integer between 1024 and 65535.");
}

export const fixtureSupabaseOrigin = `http://127.0.0.1:${fixtureSupabasePort}`;
