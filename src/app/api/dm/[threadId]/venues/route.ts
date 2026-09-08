import { withAuth, isBlocked, isDeletedProfile, verifyThreadMembership } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withNoStore } from "@/lib/no-store-response";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { coarseMidpoint, contextualVenues, isValidLocation } from "@/features/chat/server/venues";
import { NextResponse } from "next/server";

type Params = { threadId: string };
type LocationRow = { user_id: string; lat: unknown; lng: unknown; updated_at: unknown };

/**
 * A venue search is allowed only when both DM members retain their discovery
 * audience relationship. It deliberately runs with the service client after
 * user-scoped membership and block checks, and returns no location-derived
 * result when either location is stale or malformed.
 */
export const GET = withNoStore(withAuth<Params>(async (_request, { user, params, supabase }) => {
  if (!isValidUUID(params.threadId)) return apiError("Invalid thread ID", 400, "VALIDATION_ERROR");
  const rate = await enforceRateLimit("chatVenues", user.id);
  if (rate) return rate;
  const thread = await verifyThreadMembership(params.threadId, user.id);
  if (!thread) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  const peerId = thread.participant_1_id === user.id ? thread.participant_2_id : thread.participant_1_id;
  if (await isBlocked(supabase, user.id, peerId)) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");
  if (await isDeletedProfile(peerId)) return apiError("Thread not found", 404, "THREAD_NOT_FOUND");

  const db = createServiceClient();
  const freshAfter = new Date(Date.now() - 10 * 60_000).toISOString();
  const [viewerCanSeePeer, peerCanSeeViewer] = await Promise.all([
    db.rpc("discovery_subject_visible_to_viewer", { p_viewer_id: user.id, p_subject_id: peerId }),
    db.rpc("discovery_subject_visible_to_viewer", { p_viewer_id: peerId, p_subject_id: user.id }),
  ]);
  if (viewerCanSeePeer.error || peerCanSeeViewer.error) return apiError("Venue suggestions are temporarily unavailable", 503, "VENUES_UNAVAILABLE");
  // Mutual discovery visibility is the audience consent fence for a midpoint.
  // Do not use an accepted thread or Poke as permission to infer a hidden area.
  if (viewerCanSeePeer.data !== true || peerCanSeeViewer.data !== true) return NextResponse.json({ source: "unavailable", venues: [] });
  const locations = await db.from("user_locations").select("user_id,lat,lng,updated_at").in("user_id", [user.id, peerId]).gt("updated_at", freshAfter).limit(2);
  if (locations.error) return apiError("Venue suggestions are temporarily unavailable", 503, "VENUES_UNAVAILABLE");

  const rows = (locations.data ?? []) as LocationRow[];
  const own = rows.find((row) => row.user_id === user.id);
  const peer = rows.find((row) => row.user_id === peerId);
  const ownLocation = own ? { latitude: own.lat, longitude: own.lng } : null;
  const peerLocation = peer ? { latitude: peer.lat, longitude: peer.lng } : null;
  const center = ownLocation && peerLocation && isValidLocation(ownLocation) && isValidLocation(peerLocation)
    ? coarseMidpoint(ownLocation, peerLocation)
    : null;
  if (!center) return NextResponse.json({ source: "unavailable", venues: [] });
  try { return NextResponse.json(await contextualVenues(center)); }
  catch { return apiError("Venue suggestions are temporarily unavailable", 503, "VENUES_UNAVAILABLE"); }
}));
