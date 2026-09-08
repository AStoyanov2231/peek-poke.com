import { createServer } from "node:http";

const port = Number(process.env.NATIVE_FIXTURE_PORT ?? 3002);
const ownerId = "11111111-1111-4111-8111-111111111111";
const peerId = "22222222-2222-4222-8222-222222222222";
const threadId = "33333333-3333-4333-8333-333333333333";
const planId = "44444444-4444-4444-8444-444444444444";
const pokeId = "55555555-5555-4555-8555-555555555555";
const availabilityId = "77777777-7777-4777-8777-777777777777";
const meetupId = "88888888-8888-4888-8888-888888888888";
const now = () => new Date().toISOString();
const later = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();
const page = { version: "v1", next_cursor: null, has_more: false, limit: 100 };
let onboarding = true;
let availability = null;
let createdPlan = null;
let incomingPokeAccepted = false;
let planMeetupViewerConfirmed = false;
let chatMeetupViewerConfirmed = false;
let discoveryPreference = { audience: "everyone" };
let ageAdmission = { status: "adult", decided_at: "2026-09-08T00:00:00.000Z" };

function admission(status) {
  return {
    status,
    decided_at: status === "pending" ? null : now(),
  };
}

function isAdultBirthDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || month < 1 || month > 12 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const today = new Date();
  const threshold = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  return date <= threshold;
}

const owner = {
  id: ownerId,
  username: "nikola",
  display_name: "Nikola",
  avatar_url: null,
  location_text: null,
  is_online: true,
  last_seen_at: now(),
};
const peer = {
  id: peerId,
  username: "mila",
  display_name: "Mila",
  avatar_url: null,
  location_text: null,
  is_online: true,
  last_seen_at: now(),
};
const tags = ["Coffee", "Design", "Walking", "Music", "Books"].map(
  (name, index) => ({
    id: `99999999-9999-4999-8999-99999999999${index}`,
    name,
    category: "Social",
    icon: null,
    display_order: index,
  }),
);
const interests = new Set();
const recentPlan = {
  id: planId,
  owner_id: ownerId,
  activity: "Coffee & a walk",
  title: null,
  starts_at: later(-60 * 60_000),
  place_text: "The café by the park",
  visibility: "friends",
  circle_id: null,
  participant_limit: 4,
  member_count: 2,
  status: "active",
  created_at: later(-2 * 60 * 60_000),
  updated_at: now(),
  viewer_is_member: true,
  viewer_is_owner: true,
  source_thread_id: threadId,
};

const json = (res, value, status = 200, headers = {}) =>
  res
    .writeHead(status, {
      "content-type": "application/json",
      "x-request-id": "native-fixture",
      ...headers,
    })
    .end(JSON.stringify(value));
const ownerProfile = () => ({
  ...owner,
  bio: null,
  cover_image_url: null,
  created_at: now(),
  onboarding_completed: onboarding,
  roles: ["user"],
});
const publicProfileResponse = (subject) => {
  const subjectInterests = subject.id === ownerId
    ? [...interests].map((tagId) => ({
        id: tagId,
        user_id: ownerId,
        tag_id: tagId,
        created_at: now(),
        tag: tags.find((tag) => tag.id === tagId),
      }))
    : [{
        id: tags[0].id,
        user_id: peerId,
        tag_id: tags[0].id,
        created_at: now(),
        tag: tags[0],
      }];
  return {
    profile: {
      ...subject,
      bio: subject.id === peerId ? "Coffee, design, and getting outdoors." : null,
      cover_image_url: null,
      created_at: now(),
      is_premium: false,
    },
    photos: [],
    featured_media: { avatar: null, cover: null },
    interests: subjectInterests,
    stats: { photos_count: 0, friends_count: subject.id === peerId ? 1 : 0 },
    friendship: null,
    pagination: page,
  };
};
const incomingPoke = () => ({
  id: pokeId,
  senderId: peerId,
  recipientId: ownerId,
  activity: "coffee",
  customLabel: null,
  note: "Coffee after work?",
  status: incomingPokeAccepted ? "accepted" : "pending",
  expiresAt: later(60 * 60_000),
  createdAt: later(-5 * 60_000),
  respondedAt: incomingPokeAccepted ? now() : null,
  threadId: incomingPokeAccepted ? threadId : null,
});
const thread = () => ({
  id: threadId,
  participant_1_id: ownerId,
  participant_2_id: peerId,
  last_message_at: now(),
  last_message_preview: "Coffee after work?",
  created_at: later(-5 * 60_000),
  unread_count: 0,
  participant_1: owner,
  participant_2: peer,
});
const planMembers = (plan) => [
  {
    user_id: ownerId,
    role: "owner",
    joined_at: plan.created_at,
    display_name: owner.display_name,
    avatar_url: null,
  },
  ...(plan.id === planId
    ? [
        {
          user_id: peerId,
          role: "member",
          joined_at: plan.created_at,
          display_name: peer.display_name,
          avatar_url: null,
        },
      ]
    : []),
];
const plans = () => [recentPlan, ...(createdPlan ? [createdPlan] : [])];
const planById = (id) => plans().find((candidate) => candidate.id === id) ?? null;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(res, { error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
  }
  const method = req.method;

  if (url.pathname === "/__test/onboarding" && method === "POST") {
    onboarding = body.completed === true;
    return json(res, { completed: onboarding });
  }
  if (url.pathname === "/__test/age-admission" && method === "POST") {
    if (!Object.hasOwn(body, "status") || !["pending", "adult", "blocked"].includes(body.status)) {
      return json(res, { error: "invalid admission fixture state", code: "VALIDATION_ERROR" }, 400);
    }
    ageAdmission = admission(body.status);
    return json(res, ageAdmission);
  }
  if (url.pathname === "/api/auth/profile" && method === "POST")
    return json(res, { created: false, profile: { id: ownerId, onboarding_completed: onboarding } });
  if (url.pathname === "/api/bootstrap")
    return json(res, {
      version: "v1",
      identity: { id: ownerId, email: "e2e@peek-poke.test" },
      onboarding_completed: onboarding,
      age_admission: ageAdmission,
      roles: ["user"],
      feature_config_version: "v1",
      unread_summary: { threads: 0 },
    });
  if (url.pathname === "/api/age-admission") {
    if (method === "GET") return json(res, ageAdmission, 200, { "cache-control": "no-store" });
    if (method === "POST") {
      const isAdult = isAdultBirthDate(body.birth_date);
      if (isAdult === null) return json(res, { error: "Enter a valid birth date", code: "INVALID_BIRTH_DATE" }, 400);
      if (ageAdmission.status === "pending") ageAdmission = admission(isAdult ? "adult" : "blocked");
      return json(res, ageAdmission, 200, { "cache-control": "no-store" });
    }
  }
  if (url.pathname === "/api/profile/username" && method === "PATCH") {
    owner.username = body.username;
    return json(res, { profile: ownerProfile() });
  }
  if (url.pathname === "/api/profile" && method === "PATCH") {
    Object.assign(owner, body);
    return json(res, { profile: ownerProfile() });
  }
  if (url.pathname === "/api/profile") return json(res, { profile: ownerProfile() });
  if (url.pathname === "/api/profile/complete-onboarding" && method === "POST") {
    onboarding = true;
    return json(res, { success: true, profile: { id: ownerId, username: owner.username, onboarding_completed: true } });
  }
  if (url.pathname === "/api/interests") return json(res, { tags });
  if (url.pathname === "/api/profile/interests" && method === "GET")
    return json(res, {
      interests: [...interests].map((tag_id) => ({
        id: tag_id,
        user_id: ownerId,
        tag_id,
        created_at: now(),
        tag: tags.find((tag) => tag.id === tag_id),
      })),
    });
  if (url.pathname === "/api/profile/interests" && method === "POST") {
    interests.add(body.tag_id);
    return json(res, {
      interest: {
        id: body.tag_id,
        user_id: ownerId,
        tag_id: body.tag_id,
        created_at: now(),
        tag: tags.find((tag) => tag.id === body.tag_id),
      },
    });
  }
  if (url.pathname.startsWith("/api/profile/interests/") && method === "DELETE") {
    interests.delete(url.pathname.split("/").at(-1));
    return json(res, { success: true });
  }
  const publicProfileMatch = /^\/api\/profile\/([0-9a-f-]+)$/u.exec(url.pathname);
  if (publicProfileMatch && method === "GET") {
    const requestedId = publicProfileMatch[1];
    if (requestedId === ownerId) return json(res, publicProfileResponse(owner));
    if (requestedId === peerId) return json(res, publicProfileResponse(peer));
    return json(res, { error: "Profile not found", code: "NOT_FOUND" }, 404);
  }
  if (url.pathname === "/api/profile/photos") return json(res, { photos: [], pagination: page });
  if (url.pathname === "/api/coins") return json(res, { balance: 0 });
  if (url.pathname === "/api/friends")
    return json(res, {
      viewer_id: ownerId,
      friends: [],
      requests: [],
      sentRequests: [],
      sentRequestUserIds: [],
      pagination: { friends: page, requests: page, sentRequests: page },
    });
  if (url.pathname === "/api/discovery-preferences") {
    if (method === "GET") return json(res, discoveryPreference);
    if (method === "PATCH" || method === "PUT") {
      if (!["hidden", "friends", "friends_of_friends", "circles", "everyone"].includes(body.audience))
        return json(res, { error: "Invalid discovery audience", code: "VALIDATION_ERROR" }, 400);
      discoveryPreference = { audience: body.audience };
      return json(res, discoveryPreference);
    }
  }
  if (url.pathname === "/api/groups") return json(res, { groups: [], total_unread: 0, pagination: page });
  if (url.pathname === "/api/location") return json(res, { ok: true });
  if (url.pathname === "/api/nearby") return json(res, { users: [] });
  if (url.pathname === "/api/bots") return json(res, { bots: [] });

  if (url.pathname === "/api/availability") {
    if (method === "PUT") {
      availability = {
        id: availabilityId,
        userId: ownerId,
        activity: body.activity,
        customLabel: body.customLabel ?? null,
        expiresAt: later(body.durationMinutes * 60_000),
        createdAt: now(),
        updatedAt: now(),
      };
      return json(res, { availability });
    }
    if (method === "DELETE") {
      availability = null;
      return json(res, { availability });
    }
    return json(res, {
      availability,
      people: [
        {
          profile: peer,
          availability: {
            id: "66666666-6666-4666-8666-666666666666",
            userId: peerId,
            activity: "coffee",
            customLabel: null,
            expiresAt: later(60 * 60_000),
            createdAt: now(),
            updatedAt: now(),
          },
          distanceKm: 2,
          relationship: "none",
          sharedInterestNames: ["Coffee"],
        },
      ],
    });
  }

  if (url.pathname === "/api/pokes") {
    if (method === "POST") {
      return json(res, {
        poke: {
          id: pokeId,
          senderId: ownerId,
          recipientId: body.recipientId,
          activity: body.activity,
          customLabel: body.customLabel ?? null,
          note: body.note ?? null,
          status: "pending",
          expiresAt: later(60 * 60_000),
          createdAt: now(),
          respondedAt: null,
          threadId: null,
        },
        replayed: false,
      });
    }
    return json(res, {
      received: incomingPokeAccepted ? [] : [{ ...incomingPoke(), sender: peer }],
      sent: [],
    });
  }
  if (url.pathname === `/api/pokes/${pokeId}` && method === "PATCH") {
    if (body.action === "accept") incomingPokeAccepted = true;
    const poke = incomingPoke();
    return json(res, {
      poke,
      ...(body.action === "accept" ? { threadId } : {}),
      replayed: false,
    });
  }

  if (url.pathname === "/api/dm/threads") {
    const threads = incomingPokeAccepted ? [thread()] : [];
    return json(res, {
      viewer_id: ownerId,
      threads,
      total_unread: 0,
      pagination: page,
    });
  }
  if (url.pathname === `/api/dm/${threadId}/read`) return json(res, { success: true, last_read_sequence: 0 });
  if (url.pathname === `/api/dm/${threadId}/typing` && method === "POST")
    return json(res, { success: true });
  if (url.pathname === `/api/dm/${threadId}/suggestions` && method === "GET")
    return json(res, {
      source: "deterministic",
      suggestions: [
        { id: "time", text: "Would 20 minutes work?" },
        { id: "place", text: "Want to choose a public place?" },
        { id: "plan", text: "Turn this into a plan" },
      ],
    });
  if (url.pathname === `/api/dm/${threadId}/venues`)
    return json(res, { source: "unavailable", venues: [] });
  if (url.pathname === `/api/dm/${threadId}`) {
    if (method === "POST") {
      return json(res, {
        message: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          thread_id: threadId,
          sender_id: ownerId,
          content: body.content,
          message_type: body.message_type ?? "text",
          media_url: body.media_url ?? null,
          media_thumbnail_url: body.media_thumbnail_url ?? null,
          is_read: false,
          is_edited: false,
          is_deleted: false,
          created_at: now(),
          sequence: 1,
          client_id: body.client_id ?? null,
          reply_to_id: body.reply_to_id ?? null,
          reply_to: null,
          sender: owner,
        },
      });
    }
    return json(res, { thread: thread(), messages: [], pagination: page });
  }

  if (url.pathname === "/api/meetups") {
    if (method === "POST") chatMeetupViewerConfirmed = true;
    const meetup = {
      id: meetupId,
      peerId,
      status: "waiting",
      viewerConfirmed: chatMeetupViewerConfirmed,
      expiresAt: later(24 * 60 * 60_000),
      confirmedAt: null,
    };
    return json(
      res,
      method === "POST" ? { meetup, replayed: false } : { meetup: chatMeetupViewerConfirmed ? meetup : null },
    );
  }

  if (url.pathname === "/api/plans") {
    if (method === "POST") {
      createdPlan = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
        owner_id: ownerId,
        activity: body.activity,
        title: body.title ?? null,
        starts_at: body.starts_at,
        place_text: body.place_text,
        visibility: body.visibility,
        circle_id: body.circle_id ?? null,
        participant_limit: body.participant_limit ?? 2,
        member_count: 1,
        status: "active",
        created_at: now(),
        updated_at: now(),
        viewer_is_member: true,
        viewer_is_owner: true,
        source_thread_id: body.source_thread_id ?? null,
      };
      return json(res, { plan: createdPlan, replayed: false }, 201);
    }
    return json(res, { plans: plans() });
  }

  const planMatch = /^\/api\/plans\/([0-9a-f-]+)(?:\/(meetups|join))?$/u.exec(url.pathname);
  if (planMatch) {
    const [, requestedPlanId, operation] = planMatch;
    const requestedPlan = planById(requestedPlanId);
    if (!requestedPlan) return json(res, { error: "Plan not found", code: "NOT_FOUND" }, 404);
    if (operation === "meetups") {
      if (requestedPlanId !== planId)
        return json(res, { acknowledgements: [], canConfirm: false, closesAt: null });
      if (method === "POST") planMeetupViewerConfirmed = true;
      return json(res, {
        acknowledgements: [
          {
            peerId,
            viewerConfirmed: planMeetupViewerConfirmed,
            peerConfirmed: true,
            confirmedAt: planMeetupViewerConfirmed ? now() : null,
          },
        ],
        canConfirm: true,
        closesAt: later(47 * 60 * 60_000),
      });
    }
    if (operation === "join" && method === "POST")
      return json(res, { plan: requestedPlan, joined: true });
    if (!operation) {
      if (method === "DELETE") {
        requestedPlan.status = "cancelled";
      }
      if (method === "PATCH") Object.assign(requestedPlan, body, { updated_at: now() });
      return json(res, { plan: requestedPlan, members: planMembers(requestedPlan) });
    }
  }

  return json(res, {
    version: "v1",
    error: `Native fixture has no ${method} ${url.pathname}`,
    message: "Fixture endpoint unavailable",
    code: "NOT_FOUND",
    request_id: "native-fixture",
  }, 404);
}).listen(port, "127.0.0.1", () =>
  console.log(`Native fixture API listening on ${port}`),
);
