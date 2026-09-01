import { NextResponse } from "next/server";
import { locationAttestationResponseSchema } from "@peekpoke/shared";
import { withAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { withNoStore } from "@/lib/no-store-response";
import { enforceRateLimit } from "@/lib/rate-limit";
import { coordsSchema, parseBody } from "@/lib/validators";

const ISSUER_TIMEOUT_MS = 5_000;

function configuredIssuerUrl() {
  const value = process.env.LOCATION_ATTESTATION_ISSUER_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    const localDevelopment = process.env.NODE_ENV !== "production"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopment) return null;
    return url;
  } catch {
    return null;
  }
}

export const POST = withNoStore(withAuth(async (request, { user }) => {
  const limited = await enforceRateLimit("location", user.id);
  if (limited) return limited;

  const [body, bodyError] = await parseBody(request, coordsSchema);
  if (bodyError) return bodyError;

  const issuerUrl = configuredIssuerUrl();
  const issuerToken = process.env.LOCATION_ATTESTATION_ISSUER_TOKEN;
  if (!issuerUrl || !issuerToken) {
    return apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ISSUER_TIMEOUT_MS);
  try {
    const issuerResponse = await fetch(issuerUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issuerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ user_id: user.id, ...body }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!issuerResponse.ok) {
      return apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE");
    }
    const result = locationAttestationResponseSchema.safeParse(await issuerResponse.json());
    if (!result.success) {
      console.error("location/attestation: malformed issuer response");
      return apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE");
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("location/attestation: issuer request failed", error);
    return apiError("Location verification is unavailable", 503, "LOCATION_VERIFICATION_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}));
