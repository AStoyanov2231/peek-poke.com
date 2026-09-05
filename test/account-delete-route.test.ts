import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorEnvelopeSchema, contractErrorFailure } from "@peekpoke/shared";
import { withRequestContext } from "@/lib/request-context";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  globalSignOut: vi.fn(async () => ({ error: null })),
  localSignOut: vi.fn(async () => ({ error: null })),
  maybeSingle: vi.fn(async () => ({
    data: { stripe_customer_id: "cus_account_delete" },
    error: null,
  })),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: unknown) => Promise<Response>) =>
    withRequestContext(async (request: Request) => handler(request, {
      user: { id: USER_ID },
      supabase: {
        auth: {
          getSession: vi.fn(async () => ({
            data: { session: { access_token: "account-delete-access-token" } },
          })),
          signOut: harness.localSignOut,
        },
      },
    })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    auth: { admin: { signOut: harness.globalSignOut } },
    rpc: harness.rpc,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: harness.maybeSingle,
    })),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

import { POST } from "@/app/api/account/delete/route";

function request(requestId: string) {
  return new Request("https://example.test/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ confirmation: "DELETE" }),
  });
}

describe("atomic account deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_account_delete" },
      error: null,
    });
    harness.globalSignOut.mockResolvedValue({ error: null });
    harness.localSignOut.mockResolvedValue({ error: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("fails closed with the canonical cross-platform error when the atomic RPC is absent", async () => {
    harness.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "queue function not found" },
    });

    const response = await POST(request("account-delete-migration-missing"));
    const payload = apiErrorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      code: "ACCOUNT_DELETE_UNAVAILABLE",
      message: "Account deletion is temporarily unavailable. Please try again.",
      request_id: "account-delete-migration-missing",
    });
    expect(contractErrorFailure(payload, response.status, payload.request_id)).toMatchObject({
      code: "ACCOUNT_DELETE_UNAVAILABLE",
      status: 503,
    });
    expect(harness.rpc).toHaveBeenCalledWith("queue_account_deletion", {
      p_user_id: USER_ID,
      p_stripe_customer_id: "cus_account_delete",
    });
    expect(harness.globalSignOut).not.toHaveBeenCalled();
    expect(harness.localSignOut).not.toHaveBeenCalled();
  });

  it("reports delivery-blocked deletion without signing out", async () => {
    harness.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "SHARED_GROUP_DELIVERY_IN_FLIGHT" },
    });

    const response = await POST(request("account-delete-delivery-blocked"));
    const payload = apiErrorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      code: "ACCOUNT_DELETE_BLOCKED",
      message: "Account deletion is blocked while a notification is being delivered. Please retry later.",
    });
    expect(harness.globalSignOut).not.toHaveBeenCalled();
    expect(harness.localSignOut).not.toHaveBeenCalled();
  });

  it("does not report success for a wrong-account or invalid snapshot response", async () => {
    harness.rpc.mockResolvedValue({
      data: { error: "PROFILE_ACCOUNT_MISMATCH" },
      error: null,
    });

    const response = await POST(request("account-delete-account-mismatch"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "ACCOUNT_DELETE_FAILED" });
    expect(harness.localSignOut).not.toHaveBeenCalled();
  });

  it("accepts an empty atomic snapshot and signs out locally only after durable queue success", async () => {
    harness.rpc.mockResolvedValue({
      data: { success: true, queued: true, job_id: "job-empty" },
      error: null,
    });

    const response = await POST(request("account-delete-empty-snapshot"));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ success: true, queued: true });
    expect(harness.globalSignOut).toHaveBeenCalledWith(
      "account-delete-access-token",
      "global",
    );
    expect(harness.localSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("can retry safely after a lost RPC response without invoking any legacy destructive fallback", async () => {
    harness.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "57014", message: "response lost" } })
      .mockResolvedValueOnce({
        data: { success: true, queued: true, job_id: "same-job" },
        error: null,
      });

    const first = await POST(request("account-delete-lost-response-1"));
    const second = await POST(request("account-delete-lost-response-2"));

    expect(first.status).toBe(500);
    expect(second.status).toBe(202);
    expect(harness.rpc).toHaveBeenCalledTimes(2);
    expect(harness.rpc.mock.calls[0]).toEqual(harness.rpc.mock.calls[1]);
    expect(harness.globalSignOut).toHaveBeenCalledTimes(1);
    expect(harness.localSignOut).toHaveBeenCalledTimes(1);
  });
});
