import type { Page } from "@playwright/test";
import { availabilityReadResponseSchema } from "@peekpoke/shared";
export const ownerId = "11111111-1111-4111-8111-111111111111";
export const peerId = "22222222-2222-4222-8222-222222222222";
export const threadId = "33333333-3333-4333-8333-333333333333";
export const planId = "44444444-4444-4444-8444-444444444444";
const pokeId = "55555555-5555-4555-8555-555555555555";
const pageInfo = {
  version: "v1",
  next_cursor: null,
  has_more: false,
  limit: 100,
};
export async function installSocialFixture(
  page: Page,
  options: { empty?: boolean; retryPoke?: boolean; peerMet?: boolean; onboarding?: boolean; retryVisibility?: boolean; venues?: boolean; map?: boolean; planMeetup?: boolean; discoveryContext?: boolean; ageAdmission?: "pending" | "adult" | "blocked" } = {},
) {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 60 * 60_000).toISOString();
  const owner = {
    id: ownerId,
    username: options.onboarding ? "user_111111111111411" : "nikola",
    display_name: "Nikola",
    avatar_url: null,
    location_text: null,
    is_online: true,
    last_seen_at: now,
  };
  const peer = { ...owner, id: peerId, username: "mila", display_name: "Mila" };
  let availability: Record<string, unknown> | null = null;
  const peerAvailability = {
    id: "66666666-6666-4666-8666-666666666666",
    userId: peerId,
    activity: "coffee",
    customLabel: null,
    expiresAt: later,
    createdAt: now,
    updatedAt: now,
  };
  const contextPeer = {
    ...owner,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    username: "sofia",
    display_name: "Sofia",
  };
  const contextPeerAvailability = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: contextPeer.id,
    activity: "walk",
    customLabel: null,
    expiresAt: later,
    createdAt: now,
    updatedAt: now,
  };
  const incoming = {
    id: pokeId,
    senderId: peerId,
    recipientId: ownerId,
    activity: "coffee",
    customLabel: null,
    note: "A coffee and a walk?",
    status: "pending",
    expiresAt: later,
    createdAt: now,
    respondedAt: null,
    threadId: null,
  };
  let plan: Record<string, unknown> | null = options.planMeetup ? {
    id: planId, owner_id: ownerId, title: "Coffee & a walk", activity: "coffee", circle_id: null, participant_limit: 4,
    starts_at: new Date(Date.now() - 60 * 60_000).toISOString(), place_text: "The café by the park", visibility: "private",
    member_count: 2, status: "active", created_at: now, updated_at: now, viewer_is_member: true, viewer_is_owner: true, source_thread_id: threadId,
  } : null;
  let pokeAttempts = 0;
  const apiPaths: string[] = [];
  const apiUrls: string[] = [];
  const keys: string[] = [];
  const joins: string[] = [];
  const meetups: string[] = [];
  const planMeetups: string[] = [];
  let planMeetupConfirmed = false;
  let viewerConfirmed = false;
  let onboardingCompleted = !options.onboarding;
  let ageAdmission = {
    status: options.ageAdmission ?? "adult",
    decided_at: options.ageAdmission === "pending" ? null : "2026-09-08T00:00:00.000Z",
  };
  await page.request.post("http://127.0.0.1:54321/__test/age-admission", {
    data: { status: ageAdmission.status },
  });
  let audience = "everyone";
  let visibilityAttempts = 0;
  const tags = ["Coffee", "Design", "Walking", "Music", "Books"].map((name, index) => ({ id: `99999999-9999-4999-8999-99999999999${index}`, name, category: "Social", icon: null, display_order: index }));
  const selectedTags = new Set<string>();
  if (options.map) {
    await page.route("https://api.mapbox.com/**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [], imports: [{ id: "basemap", data: { version: 8, schema: { lightPreset: { default: "day", type: "string" } }, sources: {}, layers: [{ id: "fixture-background", type: "background", paint: { "background-color": "#ebe7df" } }] } }] }) }));
    await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204 }));
  }
  await page.routeWebSocket(/127\.0\.0\.1:54321/, (ws) => {
    ws.onMessage((message) => {
      try {
        const data = JSON.parse(String(message));
        ws.send(
          JSON.stringify({
            topic: data.topic,
            event: "phx_reply",
            ref: data.ref,
            payload: { status: ageAdmission.status === "adult" ? "ok" : "error", response: {} },
          }),
        );
      } catch {
        /* Ignore binary fixture heartbeats. */
      }
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const requestUrl = new URL(request.url());
    const method = request.method();
    apiPaths.push(path);
    apiUrls.push(`${path}${requestUrl.search}`);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/api/bootstrap")
      return json({
        version: "v1",
        identity: { id: ownerId, email: "e2e@peek-poke.test" },
        onboarding_completed: onboardingCompleted,
        age_admission: ageAdmission,
        roles: ["user"],
        feature_config_version: "v1",
        unread_summary: { threads: 0 },
      });
    if (path === "/api/age-admission") {
      if (method === "POST" && ageAdmission.status === "pending") {
        const birthDate = request.postDataJSON().birth_date;
        ageAdmission = {
          status: typeof birthDate === "string" && /^\d{4}/.test(birthDate) && Number(birthDate.slice(0, 4)) <= 2008
            ? "adult"
            : "blocked",
          decided_at: "2026-09-08T00:00:00.000Z",
        };
        await page.request.post("http://127.0.0.1:54321/__test/age-admission", {
          data: { status: ageAdmission.status },
        });
      }
      return json(ageAdmission);
    }
    if (path === "/api/profile/username") {
      owner.username = request.postDataJSON().username;
      return json({ profile: { ...owner, bio: null, cover_image_url: null, created_at: now, onboarding_completed: onboardingCompleted, roles: ["user"] } });
    }
    if (path === "/api/profile" && method === "PATCH") {
      owner.display_name = request.postDataJSON().display_name;
      return json({ profile: { ...owner, bio: null, cover_image_url: null, created_at: now, onboarding_completed: onboardingCompleted, roles: ["user"] } });
    }
    if (path === "/api/profile/complete-onboarding") {
      onboardingCompleted = true;
      await page.request.post("http://127.0.0.1:54321/__test/onboarding", { data: { completed: true } });
      return json({ success: true, profile: { id: ownerId, username: owner.username, onboarding_completed: true } });
    }
    if (path === "/api/profile")
      return json({
        profile: {
          ...owner,
          bio: null,
          cover_image_url: null,
          created_at: now,
          onboarding_completed: onboardingCompleted,
          roles: ["user"],
        },
      });
    if (path === "/api/interests") return json({ tags });
    const interest = (id: string) => ({ id, user_id: ownerId, tag_id: id, created_at: now, tag: tags.find((tag) => tag.id === id) });
    if (path === "/api/profile/interests") {
      if (method === "POST") { const id = request.postDataJSON().tag_id; selectedTags.add(id); return json({ interest: interest(id) }); }
      return json({ interests: [...selectedTags].map(interest) });
    }
    if (path.startsWith("/api/profile/interests/") && method === "DELETE") { selectedTags.delete(path.split("/").at(-1)!); return json({ success: true }); }
    if (path === "/api/discovery-preferences") {
      if (method === "PATCH") {
        visibilityAttempts += 1;
        if (options.retryVisibility && visibilityAttempts === 1) return json({ error: "Save interrupted" }, 503);
        audience = request.postDataJSON().audience;
      }
      return json({ audience });
    }
    if (path === "/api/profile/photos") return json({ photos: [], pagination: pageInfo });
    if (path === `/api/profile/${peerId}`) return json({ profile: { ...peer, bio: "Coffee, design, and getting outdoors.", cover_image_url: null, created_at: now, is_premium: false }, photos: [], featured_media: { avatar: null, cover: null }, interests: [], stats: { photos_count: 0, friends_count: 1 }, friendship: null, pagination: pageInfo });
    if (path === `/api/profile/${peerId}/social-context`) return json({ availability: peerAvailability, sharedCircles: [{ id: threadId, name: "Shared group" }], upcomingPlans: [], mutualMeetups: 1 });
    if (path === "/api/account/delete") return json({ error: "Test-only account deletion outage" }, 503);
    if (path === "/api/coins") return json({ balance: 0 });
    if (path === "/api/friends")
      return json({
        viewer_id: ownerId,
        friends: [],
        requests: [],
        sentRequests: [],
        sentRequestUserIds: [],
        pagination: {
          friends: pageInfo,
          requests: pageInfo,
          sentRequests: pageInfo,
        },
      });
    if (path === "/api/groups")
      return json({ groups: [], total_unread: 0, pagination: pageInfo });
    if (path === "/api/location") return json({ ok: true });
    if (path === "/api/nearby") return json({ users: options.map ? [{ userId: peerId, username: peer.username, display_name: peer.display_name, avatar_url: null, is_online: true, last_seen_at: now, lat: 42.7, lng: 23.32 }] : [] });
    if (path === "/api/bots") return json({ bots: [] });
    if (path === "/api/availability") {
      if (method === "PUT") {
        const body = request.postDataJSON();
        availability = {
          id: "77777777-7777-4777-8777-777777777777",
          userId: ownerId,
          activity: body.activity,
          customLabel: body.customLabel,
          expiresAt: later,
          createdAt: now,
          updatedAt: now,
        };
        return json({ availability });
      }
      if (method === "DELETE") {
        availability = null;
        return json({ availability });
      }
      const includeDiscoveryContext = options.discoveryContext
        && requestUrl.searchParams.get("discovery_context") === "1";
      const response = {
        availability,
        people: options.empty
          ? []
          : includeDiscoveryContext
            ? [
                {
                  profile: contextPeer,
                  availability: contextPeerAvailability,
                  distanceKm: 2,
                  relationship: "none",
                  sharedInterestNames: [],
                  discoveryReasons: ["mutual_meetup", "connected_before", "mutual_friends"],
                },
                {
                  profile: peer,
                  availability: peerAvailability,
                  distanceKm: 2,
                  relationship: "none",
                  sharedInterestNames: ["Coffee", "Design"],
                  discoveryReasons: ["intent_match", "shared_interests"],
                },
              ]
            : [
              {
                profile: peer,
                availability: peerAvailability,
                distanceKm: 2,
                relationship: "none",
                sharedInterestNames: ["Coffee", "Design"],
              },
            ],
      };
      return json(availabilityReadResponseSchema.parse(response));
    }
    if (path === "/api/pokes") {
      if (method === "POST") {
        keys.push(request.headers()["idempotency-key"]);
        pokeAttempts += 1;
        if (options.retryPoke && pokeAttempts === 1)
          return json(
            {
              version: "v1",
              error: "Connection interrupted. Please try again.",
              message: "Connection interrupted. Please try again.",
              code: "SERVICE_UNAVAILABLE",
              request_id: null,
            },
            503,
          );
        return json({
          poke: {
            ...incoming,
            ...request.postDataJSON(),
            senderId: ownerId,
            recipientId: peerId,
          },
          replayed: pokeAttempts > 1,
        });
      }
      return json({
        received: options.empty
          ? []
          : [{ ...incoming, sender: peer, recipient: owner }],
        sent: [],
      });
    }
    if (path === `/api/pokes/${pokeId}`) {
      incoming.status = "accepted";
      return json({
        poke: { ...incoming, threadId, respondedAt: now },
        threadId,
        replayed: false,
      });
    }
    if (path === "/api/dm/threads")
      return json({
        viewer_id: ownerId,
        threads: [],
        total_unread: 0,
        pagination: pageInfo,
      });
    if (path === `/api/dm/${threadId}`)
      return json({
        thread: {
          id: threadId,
          participant_1_id: ownerId,
          participant_2_id: peerId,
          created_at: now,
          last_message_at: now,
          last_message_preview: "Coffee?",
          unread_count: 0,
          participant_1: owner,
          participant_2: peer,
        },
        messages: [],
        pagination: pageInfo,
      });
    if (path.endsWith("/suggestions"))
      return json({
        source: "deterministic",
        suggestions: [
          { id: "time", text: "Would 20 minutes work?" },
          { id: "place", text: "Want to choose a public place?" },
          { id: "plan", text: "Turn this into a plan" },
        ],
      });
    if (path.endsWith("/venues")) return json(options.venues ? { source: "google_places", venues: [{ id: "fixture-public-cafe", name: "Park Café", category: "cafe", address: "By the park", latitude: 42.69, longitude: 23.32 }] } : { source: "unavailable", venues: [] });
    if (path.endsWith("/read"))
      return json({ success: true, last_read_sequence: 0 });
    if (path === "/api/meetups") {
      if (method === "POST") {
        meetups.push(request.headers()["idempotency-key"]);
        viewerConfirmed = true;
      }
      const meetup = {
        id: "88888888-8888-4888-8888-888888888888",
        peerId,
        status: viewerConfirmed && options.peerMet ? "confirmed" : "waiting",
        viewerConfirmed,
        expiresAt: later,
        confirmedAt: viewerConfirmed && options.peerMet ? now : null,
      };
      return json(
        method === "GET"
          ? { meetup: options.peerMet || viewerConfirmed ? meetup : null }
          : { meetup, replayed: false },
      );
    }
    if (path === "/api/plans") {
      if (method === "POST") {
        const body = request.postDataJSON();
        const { nearby_discovery: _nearbyDiscovery, ...planFields } = body;
        plan = {
          id: planId,
          owner_id: ownerId,
          title: null,
          circle_id: null,
          participant_limit: 8,
          ...planFields,
          member_count: 1,
          status: "active",
          created_at: now,
          updated_at: now,
          viewer_is_member: true,
          viewer_is_owner: true,
          source_thread_id: body.source_thread_id ?? null,
        };
        return json({ plan, replayed: false });
      }
      return json({ plans: plan ? [plan] : [] });
    }
    if (path === `/api/plans/${planId}`)
      return json({
        plan,
        members: [
          {
            user_id: ownerId,
            role: "owner",
            joined_at: now,
            display_name: "Nikola",
            avatar_url: null,
          },
          ...(options.planMeetup ? [{ user_id: peerId, role: "member", joined_at: now, display_name: "Mila", avatar_url: null }] : []),
        ],
      });
    if (path === `/api/plans/${planId}/meetups`) {
      if (method === "POST") {
        planMeetups.push(request.headers()["idempotency-key"]);
        if (planMeetups.length === 1) return json({ version: "v1", error: "Confirmation interrupted. Try again.", message: "Confirmation interrupted. Try again.", code: "SERVICE_UNAVAILABLE", request_id: null }, 503);
        planMeetupConfirmed = true;
      }
      return json({ acknowledgements: options.planMeetup ? [{ peerId, viewerConfirmed: planMeetupConfirmed, peerConfirmed: true, confirmedAt: planMeetupConfirmed ? now : null }] : [], canConfirm: Boolean(options.planMeetup), closesAt: later });
    }
    if (path === `/api/plans/${planId}/join`) {
      joins.push(request.postDataJSON().share_token);
      plan = {
        id: planId,
        owner_id: peerId,
        activity: "Coffee & a walk",
        title: null,
        starts_at: later,
        place_text: "The café by the park",
        visibility: "private",
        circle_id: null,
        participant_limit: 4,
        member_count: 2,
        status: "active",
        created_at: now,
        updated_at: now,
        viewer_is_member: true,
        viewer_is_owner: false,
        source_thread_id: null,
      };
      return json({ plan, joined: true });
    }
    if (path === "/api/invites")
      return json({
        invite_url:
          "http://127.0.0.1:3001/invite/11111111-1111-4111-8111-111111111111",
      });
    return json({ error: `Unimplemented test-only fixture: ${path}` }, 503);
  });
  return {
    apiPaths,
    apiUrls,
    pokeKeys: keys,
    planJoins: joins,
    meetupPosts: meetups,
    planMeetupPosts: planMeetups,
  };
}
