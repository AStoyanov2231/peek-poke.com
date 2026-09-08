import { describe, expect, it } from "vitest";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  requireSupabaseIntegrationTarget,
  resolveSupabaseIntegrationTarget,
} from "./support/supabase-integration-target";

const BASE = {
  SUPABASE_TEST_SERVICE_ROLE_KEY: "service-test-key",
  SUPABASE_TEST_ANON_KEY: "anon-test-key",
};

describe("Supabase destructive integration target guard", () => {
  it("leaves a fully unset environment unconfigured so suites skip", () => {
    expect(resolveSupabaseIntegrationTarget({}, { requireLocalAppUrl: true })).toEqual({
      requested: false,
      configured: false,
      reason: null,
    });
  });

  it("allows a loopback database and local app for browser/API integration", () => {
    const target = resolveSupabaseIntegrationTarget({
      ...BASE,
      SUPABASE_TEST_URL: "http://127.0.0.1:54321",
      SUPABASE_TEST_APP_URL: "http://localhost:3000",
    }, { requireLocalAppUrl: true });
    expect(target).toMatchObject({ configured: true, hosted: false, appUrl: "http://localhost:3000" });
  });

  it("requires a local application origin even when the database target is isolated", () => {
    const target = resolveSupabaseIntegrationTarget({
      ...BASE,
      SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_TEST_TARGET: "abcdefghijklmnopqrst",
      SUPABASE_TEST_ISOLATED: "true",
      SUPABASE_TEST_APP_URL: "https://preview.example.test",
    }, { requireLocalAppUrl: true });
    expect(target).toMatchObject({ configured: false, requested: true });
    expect(target.reason).toContain("loopback");
  });

  it("allows a hosted target only when the matching ref is explicitly isolated", () => {
    const target = resolveSupabaseIntegrationTarget({
      ...BASE,
      SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_TEST_TARGET: "abcdefghijklmnopqrst",
      SUPABASE_TEST_ISOLATED: "true",
    }, { requireLocalAppUrl: false });
    expect(target).toMatchObject({ configured: true, hosted: true, targetRef: "abcdefghijklmnopqrst" });
  });

  it("denies the production project without its additional explicit opt-in", () => {
    const target = resolveSupabaseIntegrationTarget({
      ...BASE,
      SUPABASE_TEST_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_TARGET: PRODUCTION_SUPABASE_PROJECT_REF,
      SUPABASE_TEST_ISOLATED: "true",
    }, { requireLocalAppUrl: false });
    expect(target).toMatchObject({ configured: false, requested: true });
    expect(target.reason).toContain("production");
  });

  it("allows the production project only with all hosted opt-ins", () => {
    const target = resolveSupabaseIntegrationTarget({
      ...BASE,
      SUPABASE_TEST_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_TARGET: PRODUCTION_SUPABASE_PROJECT_REF,
      SUPABASE_TEST_ISOLATED: "true",
      SUPABASE_TEST_ALLOW_PRODUCTION: "1",
    }, { requireLocalAppUrl: false });
    expect(target).toMatchObject({ configured: true, hosted: true, targetRef: PRODUCTION_SUPABASE_PROJECT_REF });
  });

  it("allows the exact deployed app only with every production opt-in", () => {
    const deployed = {
      ...BASE,
      SUPABASE_TEST_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_TEST_TARGET: PRODUCTION_SUPABASE_PROJECT_REF,
      SUPABASE_TEST_ISOLATED: "true",
      SUPABASE_TEST_ALLOW_PRODUCTION: "1",
      SUPABASE_TEST_ALLOW_DEPLOYED_APP: "1",
      SUPABASE_TEST_APP_URL: "https://www.peek-poke.com",
    };
    expect(resolveSupabaseIntegrationTarget(deployed, { requireLocalAppUrl: true })).toMatchObject({
      configured: true,
      hosted: true,
      appUrl: "https://www.peek-poke.com",
      targetRef: PRODUCTION_SUPABASE_PROJECT_REF,
    });

    for (const partial of [
      { ...deployed, SUPABASE_TEST_APP_URL: "https://peek-poke.com" },
      { ...deployed, SUPABASE_TEST_APP_URL: "https://www.peek-poke.com:8443" },
      { ...deployed, SUPABASE_TEST_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:8443` },
      { ...deployed, SUPABASE_TEST_URL: "https://abcdefghijklmnopqrst.supabase.co" },
      { ...deployed, SUPABASE_TEST_TARGET: "abcdefghijklmnopqrst" },
      { ...deployed, SUPABASE_TEST_ISOLATED: "false" },
      { ...deployed, SUPABASE_TEST_ALLOW_PRODUCTION: "0" },
      { ...deployed, SUPABASE_TEST_ALLOW_DEPLOYED_APP: "0" },
    ]) {
      const target = resolveSupabaseIntegrationTarget(partial, { requireLocalAppUrl: true });
      expect(target).toMatchObject({ configured: false, requested: true });
      expect(target.reason).toContain("production app");
    }
  });

  it("fails closed for partial requested configuration", () => {
    const target = resolveSupabaseIntegrationTarget({ SUPABASE_TEST_URL: "http://localhost:54321" }, { requireLocalAppUrl: false });
    expect(() => requireSupabaseIntegrationTarget(target, {}, ["SUPABASE_TEST_SERVICE_ROLE_KEY"], "test suite")).toThrow("complete credentials");
  });

  it("treats a production opt-in without a target as incomplete configuration", () => {
    expect(resolveSupabaseIntegrationTarget({ SUPABASE_TEST_ALLOW_PRODUCTION: "1" }, { requireLocalAppUrl: false })).toMatchObject({ requested: true, configured: false });
  });

  it("accepts IPv6 loopback but refuses non-HTTP local app protocols", () => {
    const env = { ...BASE, SUPABASE_TEST_URL: "http://[::1]:54321", SUPABASE_TEST_APP_URL: "http://[::1]:3000" };
    expect(resolveSupabaseIntegrationTarget(env, { requireLocalAppUrl: true })).toMatchObject({ configured: true, hosted: false });
    expect(resolveSupabaseIntegrationTarget({ ...env, SUPABASE_TEST_APP_URL: "ftp://localhost:3000" }, { requireLocalAppUrl: true })).toMatchObject({ configured: false });
  });
});
