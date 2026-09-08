import { beforeEach, describe, expect, it, vi } from "vitest";
import { ageAdmissionSchema } from "@peekpoke/shared";
import { apiErrorEnvelopeSchema } from "@peekpoke/shared/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  withAuth: (handler: (request: Request, context: { user: { id: string }; ageAdmission: unknown }) => Promise<Response>) => handler,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/features/age-admission/server/age-admission", () => ({
  isAdultBirthDate: (birthDate: string) => {
    if (birthDate === "2000-01-01") return true;
    if (birthDate === "2010-01-01") return false;
    return null;
  },
  recordAccountAgeAdmission: mocks.record,
}));

import { GET, POST } from "@/app/api/age-admission/route";

function context(status: "pending" | "adult" | "blocked" = "pending") {
  return {
    user: { id: USER_ID },
    ageAdmission: {
      status,
      decided_at: status === "pending" ? null : "2026-09-08T00:00:00.000Z",
    },
  };
}

describe("age admission API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
  });

  it("returns the current decision directly without an error envelope", async () => {
    const response = await GET(new Request("https://example.test/api/age-admission"), context("blocked") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ageAdmissionSchema.parse(await response.json())).toEqual(context("blocked").ageAdmission);
  });

  it("records only the adult boolean for a valid adult declaration", async () => {
    mocks.record.mockResolvedValue({
      data: { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" },
    });
    const response = await POST(new Request("https://example.test/api/age-admission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birth_date: "2000-01-01" }),
    }), context() as never);

    expect(response.status).toBe(200);
    expect(mocks.rateLimit).toHaveBeenCalledWith("ageAdmission", USER_ID);
    expect(mocks.record).toHaveBeenCalledWith(USER_ID, true);
    expect(ageAdmissionSchema.parse(await response.json())).toEqual({
      status: "adult",
      decided_at: "2026-09-08T00:00:00.000Z",
    });
  });

  it("persists a blocked decision without echoing the declaration", async () => {
    mocks.record.mockResolvedValue({
      data: { status: "blocked", decided_at: "2026-09-08T00:00:00.000Z" },
    });
    const response = await POST(new Request("https://example.test/api/age-admission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birth_date: "2010-01-01" }),
    }), context() as never);

    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(USER_ID, false);
    expect(await response.text()).not.toContain("2010-01-01");
  });

  it("rejects malformed or future declarations without invoking the decision RPC", async () => {
    const response = await POST(new Request("https://example.test/api/age-admission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birth_date: "2026-12-01" }),
    }), context() as never);

    expect(response.status).toBe(400);
    expect(apiErrorEnvelopeSchema.parse(await response.json()).code).toBe("INVALID_BIRTH_DATE");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("fails closed when decision storage is unavailable", async () => {
    mocks.record.mockResolvedValue({ unavailable: true });
    const response = await POST(new Request("https://example.test/api/age-admission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birth_date: "2000-01-01" }),
    }), context() as never);

    expect(response.status).toBe(503);
    expect(apiErrorEnvelopeSchema.parse(await response.json()).code).toBe("AGE_ADMISSION_UNAVAILABLE");
  });
});
