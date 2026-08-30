import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (process.env.LIVE_SECURITY_SMOKE_CONFIRM !== "1") {
  throw new Error("Set LIVE_SECURITY_SMOKE_CONFIRM=1 to run the guarded live smoke test");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = (process.env.LIVE_SECURITY_SMOKE_BASE_URL ?? "https://www.peek-poke.com").replace(/\/$/, "");
const expectAccountErasure = process.env.LIVE_SECURITY_EXPECT_ACCOUNT_ERASURE !== "0";

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase URL, publishable key, and service-role key are required");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createdUserIds = [];
const createdStorageObjects = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(token, path, options = {}, expectedStatus = 200) {
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function expectPrivateTopicAccess(client, topic, expectedStatus) {
  const channel = client
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "security-smoke" }, () => undefined);

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        finish(() => reject(new Error(
          `Private Realtime subscription to ${topic} timed out; expected ${expectedStatus}`
        )));
      }, 15_000);

      channel.subscribe((status, error) => {
        if (status === expectedStatus) {
          finish(resolve);
        } else if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          finish(() => reject(
            error ?? new Error(`Private Realtime subscription to ${topic} was ${status}; expected ${expectedStatus}`)
          ));
        }
      });
    });
  } finally {
    await client.removeChannel(channel).catch(() => undefined);
  }
}

async function createSyntheticUser(label) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `codex-security-${label}-${suffix}@example.com`;
  const password = `S!${randomBytes(24).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      synthetic_security_test: true,
      username: `metadata_claim_${label}`,
      avatar_url: "https://attacker.invalid/avatar.jpg",
    },
  });
  if (error || !data.user) throw error ?? new Error("Synthetic user creation failed");
  createdUserIds.push(data.user.id);

  const { data: generatedProfile, error: generatedProfileError } = await admin
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", data.user.id)
    .single();
  if (generatedProfileError || !generatedProfile) {
    throw generatedProfileError ?? new Error("Auth trigger did not create a profile");
  }
  assert(
    /^user_[a-f0-9]{15}$/i.test(generatedProfile.username),
    "Auth trigger trusted caller-controlled username metadata"
  );
  assert(generatedProfile.avatar_url === null, "Auth trigger trusted caller-controlled avatar metadata");

  const username = `smoke_${label}_${suffix}`;
  const { error: profileError } = await admin.from("profiles").update({
    username,
    display_name: `Security Smoke ${label.toUpperCase()}`,
    onboarding_completed: true,
  }).eq("id", data.user.id);
  if (profileError) throw profileError;
  const { error: walletError } = await admin.from("user_coins").upsert({
    user_id: data.user.id,
    balance: 5,
  });
  if (walletError) throw walletError;

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError ?? new Error("Synthetic sign-in failed");

  return {
    id: data.user.id,
    username,
    token: session.session.access_token,
    client,
  };
}

try {
  const userA = await createSyntheticUser("a");
  const userB = await createSyntheticUser("b");
  const userC = await createSyntheticUser("c");

  const profile = await api(userA.token, "/api/profile");
  assert(profile?.profile?.id === userA.id, "Bearer profile lookup returned the wrong user");

  const { data: directPeerProfile, error: directPeerProfileError } = await userA.client
    .from("profiles")
    .select("id, username")
    .eq("id", userB.id)
    .maybeSingle();
  if (directPeerProfileError) throw directPeerProfileError;
  assert(directPeerProfile === null, "Authenticated client bypassed server-mediated profile discovery");

  const { data: interestTag, error: interestTagError } = await admin
    .from("interest_tags")
    .select("id")
    .limit(1)
    .single();
  if (interestTagError || !interestTag) {
    throw interestTagError ?? new Error("Synthetic interest tag fixture missing");
  }
  const { error: syntheticInterestError } = await admin
    .from("profile_interests")
    .insert({ user_id: userB.id, tag_id: interestTag.id });
  if (syntheticInterestError) throw syntheticInterestError;
  const { data: directPeerInterests, error: directPeerInterestsError } = await userA.client
    .from("profile_interests")
    .select("id")
    .eq("user_id", userB.id);
  if (directPeerInterestsError) throw directPeerInterestsError;
  assert(directPeerInterests.length === 0, "Authenticated client enumerated another user's interests");

  const { error: privateProfileError } = await userA.client
    .from("profiles")
    .select("push_tokens,stripe_customer_id")
    .eq("id", userA.id);
  assert(privateProfileError, "Authenticated client unexpectedly selected private profile columns");

  const serverProfileUpdate = await api(userA.token, "/api/profile", {
    method: "PATCH",
    body: JSON.stringify({ bio: "Server validated profile update" }),
  });
  assert(
    serverProfileUpdate?.profile?.bio === "Server validated profile update",
    "Server-mediated profile update failed"
  );
  const { error: directProfileUpdateError } = await userA.client
    .from("profiles")
    .update({ bio: "direct profile bypass" })
    .eq("id", userA.id);
  assert(directProfileUpdateError, "Authenticated client bypassed server profile validation and rate limits");

  const serverInterest = await api(userA.token, "/api/profile/interests", {
    method: "POST",
    body: JSON.stringify({ tag_id: interestTag.id }),
  }, 201);
  assert(serverInterest?.interest?.id, "Server-mediated interest insert failed");
  const { error: directInterestDeleteError } = await userA.client
    .from("profile_interests")
    .delete()
    .eq("id", serverInterest.interest.id);
  assert(directInterestDeleteError, "Authenticated client bypassed the server interest delete boundary");
  await api(userA.token, `/api/profile/interests/${serverInterest.interest.id}`, { method: "DELETE" });
  const { error: directInterestInsertError } = await userA.client
    .from("profile_interests")
    .insert({ user_id: userA.id, tag_id: interestTag.id });
  assert(directInterestInsertError, "Authenticated client bypassed the server interest insert boundary");

  await api(userA.token, "/api/location", {
    method: "POST",
    body: JSON.stringify({ lat: 42.6977, lng: 23.3219 }),
  });
  const { data: serverLocation, error: serverLocationError } = await admin
    .from("user_locations")
    .select("lat, lng")
    .eq("user_id", userA.id)
    .single();
  if (serverLocationError || !serverLocation) {
    throw serverLocationError ?? new Error("Server-mediated location update missing");
  }
  assert(
    serverLocation.lat === 42.6977 && serverLocation.lng === 23.3219,
    "Server-mediated location update stored the wrong coordinates"
  );
  const { error: directLocationError } = await userA.client
    .from("user_locations")
    .upsert({ user_id: userA.id, lat: 0, lng: 0 });
  assert(directLocationError, "Authenticated client bypassed server location validation and rate limits");

  const { error: rawFriendshipReadError } = await userA.client
    .from("friendships")
    .select("id")
    .limit(1);
  assert(rawFriendshipReadError, "Authenticated client unexpectedly retained raw friendship access");

  const { error: oldSearchError } = await userA.client.rpc("search_users", {
    q: userB.username,
    tag_ids: [],
    nearby_ids: [],
  });
  assert(oldSearchError, "Authenticated client unexpectedly executed the retired direct search RPC");

  await api(userA.token, "/api/search/tags?q=a");
  const initialSearch = await api(userA.token, "/api/search/users", {
    method: "POST",
    body: JSON.stringify({ q: userB.username, tag_ids: [], nearby_ids: [] }),
  });
  assert(initialSearch.some((entry) => entry.id === userB.id), "Server search did not return the synthetic peer");

  await api(userA.token, "/api/friends", {
    method: "POST",
    body: JSON.stringify({ addressee_id: userB.id }),
  });
  const { data: friendship, error: friendshipError } = await admin
    .from("friendships")
    .select("id")
    .eq("requester_id", userA.id)
    .eq("addressee_id", userB.id)
    .single();
  if (friendshipError || !friendship) throw friendshipError ?? new Error("Friend request row missing");

  await api(userB.token, `/api/friends/${friendship.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "accepted" }),
  });

  const friendThreadResponse = await api(userA.token, "/api/dm/threads", {
    method: "POST",
    body: JSON.stringify({ user_id: userB.id }),
  });
  assert(typeof friendThreadResponse?.id === "string", "Thread creation response omitted id");
  assert(friendThreadResponse.balance === 4, "Accepted-friend thread unexpectedly spent a coin");
  const { data: thread, error: threadError } = await admin
    .from("dm_threads")
    .select("id")
    .or(`and(participant_1_id.eq.${userA.id},participant_2_id.eq.${userB.id}),and(participant_1_id.eq.${userB.id},participant_2_id.eq.${userA.id})`)
    .single();
  if (threadError || !thread) throw threadError ?? new Error("DM thread row missing");
  assert(friendThreadResponse.id === thread.id, "Thread response ID did not match the database row");

  const callId = randomUUID();
  let resolveCallInvite;
  const callInvitePromise = new Promise((resolve) => {
    resolveCallInvite = resolve;
  });
  const callChannel = userB.client
    .channel(`calls:user:${userB.id}`, { config: { private: true } })
    .on("broadcast", { event: "ring-invite" }, ({ payload }) => resolveCallInvite(payload));
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Call recipient channel subscription timed out")), 15_000);
      callChannel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          reject(error ?? new Error(`Call recipient channel was ${status}`));
        }
      });
    });
    await api(userA.token, `/api/dm/${thread.id}/call`, {
      method: "POST",
      body: JSON.stringify({ action: "invite", callId }),
    });
    const callInvite = await Promise.race([
      callInvitePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Call invite broadcast timed out")), 15_000)),
    ]);
    assert(
      callInvite?.callId === callId &&
        callInvite?.threadId === thread.id &&
        callInvite?.fromUser?.id === userA.id,
      "Server call signaling delivered an invalid recipient payload"
    );
  } finally {
    await userB.client.removeChannel(callChannel).catch(() => undefined);
  }

  const { error: exposedRealtimeHelperError } = await userA.client
    .rpc("can_access_dm_realtime", { p_thread_id: thread.id });
  assert(exposedRealtimeHelperError, "Authenticated client unexpectedly called the private Realtime helper");
  const { data: directThreadBeforeBlock, error: directThreadBeforeBlockError } = await userA.client
    .from("dm_threads")
    .select("id")
    .eq("id", thread.id)
    .single();
  if (directThreadBeforeBlockError) throw directThreadBeforeBlockError;
  assert(directThreadBeforeBlock?.id === thread.id, "DM RLS denied an unblocked participant's thread");
  await expectPrivateTopicAccess(userA.client, `thread:${thread.id}`, "SUBSCRIBED");

  await api(userA.token, `/api/dm/${thread.id}`, {
    method: "POST",
    body: JSON.stringify({ content: "synthetic security smoke", message_type: "text" }),
  });
  const { data: message, error: messageError } = await admin
    .from("dm_messages")
    .select("id")
    .eq("thread_id", thread.id)
    .eq("sender_id", userA.id)
    .single();
  if (messageError || !message) throw messageError ?? new Error("DM message row missing");

  const mediaPath = `${userA.id}/security-smoke-${randomUUID()}.jpg`;
  const { error: mediaUploadError } = await admin.storage
    .from("media")
    .upload(
      mediaPath,
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
      { contentType: "image/jpeg" }
    );
  if (mediaUploadError) throw mediaUploadError;
  createdStorageObjects.push(mediaPath);
  const { data: signedMedia, error: signedMediaError } = await admin.storage
    .from("media")
    .createSignedUrl(mediaPath, 300);
  if (signedMediaError || !signedMedia) {
    throw signedMediaError ?? new Error("Synthetic media signing failed");
  }
  const thumbnailPath = `${userA.id}/security-smoke-thumbnail-${randomUUID()}.jpg`;
  const { error: thumbnailUploadError } = await admin.storage
    .from("media")
    .upload(
      thumbnailPath,
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
      { contentType: "image/jpeg" }
    );
  if (thumbnailUploadError) throw thumbnailUploadError;
  createdStorageObjects.push(thumbnailPath);
  const { data: signedThumbnail, error: signedThumbnailError } = await admin.storage
    .from("media")
    .createSignedUrl(thumbnailPath, 300);
  if (signedThumbnailError || !signedThumbnail) {
    throw signedThumbnailError ?? new Error("Synthetic thumbnail signing failed");
  }
  const imageMessageResponse = await api(userA.token, `/api/dm/${thread.id}`, {
    method: "POST",
    body: JSON.stringify({
      content: "Photo",
      message_type: "image",
      media_url: signedMedia.signedUrl,
      media_thumbnail_url: signedThumbnail.signedUrl,
    }),
  });
  assert(
    imageMessageResponse?.message?.media_url?.includes("/storage/v1/object/sign/media/") &&
      imageMessageResponse.message.media_url.includes("token="),
    "Authorized image response did not mint a signed media URL"
  );
  assert(
    imageMessageResponse?.message?.media_thumbnail_url?.includes("/storage/v1/object/sign/media/") &&
      imageMessageResponse.message.media_thumbnail_url.includes("token="),
    "Authorized image response did not mint a signed thumbnail URL"
  );
  const { data: storedImageMessage, error: storedImageError } = await admin
    .from("dm_messages")
    .select("id, media_url, media_thumbnail_url")
    .eq("id", imageMessageResponse.message.id)
    .single();
  if (storedImageError || !storedImageMessage) {
    throw storedImageError ?? new Error("Synthetic image message missing");
  }
  assert(
    storedImageMessage.media_url?.includes("/storage/v1/object/public/media/") &&
      !storedImageMessage.media_url.includes("token="),
    "DM row persisted a signed Storage bearer URL"
  );
  assert(
    storedImageMessage.media_thumbnail_url?.includes("/storage/v1/object/public/media/") &&
      !storedImageMessage.media_thumbnail_url.includes("token="),
    "DM row did not atomically persist a canonical thumbnail reference"
  );
  const hydratedConversation = await api(userB.token, `/api/dm/${thread.id}`);
  const hydratedImage = hydratedConversation.messages.find(
    (entry) => entry.id === storedImageMessage.id
  );
  assert(
    hydratedImage?.media_url?.includes("/storage/v1/object/sign/media/") &&
      hydratedImage.media_url.includes("token="),
    "Receiving participant did not hydrate a fresh signed media URL"
  );
  assert(
    hydratedImage?.media_thumbnail_url?.includes("/storage/v1/object/sign/media/") &&
      hydratedImage.media_thumbnail_url.includes("token="),
    "Receiving participant did not hydrate a fresh signed thumbnail URL"
  );

  await api(userA.token, `/api/dm/${thread.id}/${message.id}`, {
    method: "PATCH",
    body: JSON.stringify({ content: "synthetic security smoke edited" }),
  });
  await api(userB.token, `/api/dm/${thread.id}/read`, { method: "POST" });
  await api(userB.token, `/api/dm/${thread.id}/${message.id}`, {
    method: "PATCH",
    body: JSON.stringify({ content: "unauthorized edit" }),
  }, 403);
  await api(userA.token, `/api/dm/${thread.id}`, {
    method: "POST",
    body: JSON.stringify({ content: "x".repeat(4001) }),
  }, 400);

  const { error: directMessageUpdateError } = await userB.client
    .from("dm_messages")
    .update({ content: "direct bypass" })
    .eq("id", message.id);
  assert(directMessageUpdateError, "Authenticated client unexpectedly updated a DM directly");

  const nonFriendThread = await api(userA.token, "/api/dm/threads", {
    method: "POST",
    body: JSON.stringify({ user_id: userC.id }),
  });
  assert(typeof nonFriendThread?.id === "string", "Non-friend thread response omitted id");
  assert(nonFriendThread.balance === 3, "New non-friend thread did not spend exactly one coin");
  const repeatedNonFriendThread = await api(userA.token, "/api/dm/threads", {
    method: "POST",
    body: JSON.stringify({ user_id: userC.id }),
  });
  assert(repeatedNonFriendThread.id === nonFriendThread.id, "Repeated thread creation returned a duplicate thread");
  assert(repeatedNonFriendThread.balance === 3, "Existing non-friend thread spent another coin");

  await api(userA.token, `/api/dm/${nonFriendThread.id}`, {
    method: "POST",
    body: JSON.stringify({ content: "cross-thread reply target" }),
  });
  const { data: crossThreadMessage, error: crossThreadMessageError } = await admin
    .from("dm_messages")
    .select("id")
    .eq("thread_id", nonFriendThread.id)
    .eq("sender_id", userA.id)
    .single();
  if (crossThreadMessageError || !crossThreadMessage) {
    throw crossThreadMessageError ?? new Error("Cross-thread test message missing");
  }
  await api(userA.token, `/api/dm/${thread.id}`, {
    method: "POST",
    body: JSON.stringify({ content: "invalid reply", reply_to_id: crossThreadMessage.id }),
  }, 400);

  const directStoragePath = `${userA.id}/direct-storage-bypass.jpg`;
  const { error: directStorageError } = await userA.client.storage
    .from("media")
    .upload(directStoragePath, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
  if (!directStorageError) createdStorageObjects.push(directStoragePath);
  assert(directStorageError, "Authenticated client unexpectedly bypassed server upload controls");

  await api(userA.token, `/api/users/${userB.id}/block`, { method: "POST" });
  const { data: preservedThread } = await admin
    .from("dm_threads")
    .select("id")
    .eq("id", thread.id)
    .maybeSingle();
  assert(preservedThread?.id === thread.id, "Blocking destroyed the conversation thread");
  const { data: preservedMessage } = await admin
    .from("dm_messages")
    .select("id")
    .eq("id", message.id)
    .maybeSingle();
  assert(preservedMessage?.id === message.id, "Blocking destroyed message evidence");
  const { data: directBlockedThread, error: directBlockedThreadError } = await userA.client
    .from("dm_threads")
    .select("id")
    .eq("id", thread.id)
    .maybeSingle();
  if (directBlockedThreadError) throw directBlockedThreadError;
  assert(directBlockedThread === null, "Blocked thread leaked through direct Data API access");
  const { data: directBlockedMessage, error: directBlockedMessageError } = await userA.client
    .from("dm_messages")
    .select("id")
    .eq("id", message.id)
    .maybeSingle();
  if (directBlockedMessageError) throw directBlockedMessageError;
  assert(directBlockedMessage === null, "Blocked message leaked through direct Data API access");
  await api(userA.token, `/api/dm/${thread.id}`, {}, 404);
  await api(userB.token, `/api/dm/${thread.id}`, {}, 404);
  const blockedThreads = await api(userA.token, "/api/dm/threads");
  assert(!blockedThreads.threads.some((entry) => entry.id === thread.id), "Blocked thread leaked through thread list");
  const blockedPreload = await api(userA.token, "/api/preload");
  assert(!blockedPreload.messages.threads.some((entry) => entry.id === thread.id), "Blocked thread leaked through preload");
  await expectPrivateTopicAccess(userA.client, `thread:${thread.id}`, "CHANNEL_ERROR");
  const blockedSearch = await api(userA.token, "/api/search/users", {
    method: "POST",
    body: JSON.stringify({ q: userB.username, tag_ids: [], nearby_ids: [] }),
  });
  assert(!blockedSearch.some((entry) => entry.id === userB.id), "Blocked user leaked through server search");

  await api(userA.token, `/api/users/${userB.id}/block`, { method: "DELETE" });
  const restoredConversation = await api(userA.token, `/api/dm/${thread.id}`);
  assert(restoredConversation.messages.some((entry) => entry.id === message.id), "Unblocking did not restore preserved history");
  const { data: directRestoredMessage, error: directRestoredMessageError } = await userA.client
    .from("dm_messages")
    .select("id")
    .eq("id", message.id)
    .single();
  if (directRestoredMessageError) throw directRestoredMessageError;
  assert(directRestoredMessage?.id === message.id, "Unblocking did not restore participant Data API access");
  await expectPrivateTopicAccess(userA.client, `thread:${thread.id}`, "SUBSCRIBED");

  const departingMessage = await api(userC.token, `/api/dm/${nonFriendThread.id}`, {
    method: "POST",
    body: JSON.stringify({ content: "erase this authored content", message_type: "text" }),
  });
  assert(typeof departingMessage?.message?.id === "string", "Departing user message was not created");

  await api(userC.token, "/api/account/delete", {
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE" }),
  }, expectAccountErasure ? 200 : 503);

  if (!expectAccountErasure) {
    const { data: retainedProfile, error: retainedProfileError } = await admin
      .from("profiles")
      .select("deleted_at, auth_user_id")
      .eq("id", userC.id)
      .single();
    if (retainedProfileError || !retainedProfile) {
      throw retainedProfileError ?? new Error("Unavailable erasure profile check failed");
    }
    assert(
      retainedProfile.deleted_at === null && retainedProfile.auth_user_id === userC.id,
      "Unavailable provider cleanup partially erased the local account"
    );
    // The route must fail before local erasure while the provider dependency is
    // unavailable. Exercise the already-live local erasure RPC separately so
    // retained-peer API/RLS behavior is still covered without provider secrets.
    const { error: forcedErasureError } = await admin.rpc("erase_account_data", {
      p_user_id: userC.id,
    });
    if (forcedErasureError) throw forcedErasureError;
    const { error: forcedAuthDeleteError } = await admin.auth.admin.deleteUser(userC.id);
    if (forcedAuthDeleteError) throw forcedAuthDeleteError;
  }

  const { data: erasedProfile, error: erasedProfileError } = await admin
    .from("profiles")
    .select("username, display_name, deleted_at, auth_user_id, avatar_url, cover_image_url, push_tokens, stripe_customer_id")
    .eq("id", userC.id)
    .single();
  if (erasedProfileError || !erasedProfile) {
    throw erasedProfileError ?? new Error("Erased profile tombstone missing");
  }
  assert(/^deleted_[a-f0-9]{12}$/i.test(erasedProfile.username), "Erased profile kept an identifying username");
  assert(erasedProfile.display_name === "Deleted member", "Erased profile tombstone label is incorrect");
  assert(erasedProfile.deleted_at !== null && erasedProfile.auth_user_id === null, "Erased profile retained an active Auth link");
  assert(
    erasedProfile.avatar_url === null &&
      erasedProfile.cover_image_url === null &&
      erasedProfile.stripe_customer_id === null &&
      Array.isArray(erasedProfile.push_tokens) &&
      erasedProfile.push_tokens.length === 0,
    "Erased profile retained private account data"
  );

  const { data: erasedMessage, error: erasedMessageError } = await admin
    .from("dm_messages")
    .select("content, media_url, media_thumbnail_url, is_deleted")
    .eq("id", departingMessage.message.id)
    .single();
  if (erasedMessageError || !erasedMessage) {
    throw erasedMessageError ?? new Error("Erased message tombstone missing");
  }
  assert(
    erasedMessage.is_deleted === true &&
      erasedMessage.content === null &&
      erasedMessage.media_url === null &&
      erasedMessage.media_thumbnail_url === null,
    "Account erasure retained authored message content"
  );

  const retainedAfterErasure = await api(userA.token, `/api/dm/${nonFriendThread.id}`);
  assert(retainedAfterErasure.thread?.id === nonFriendThread.id, "Account erasure destroyed the peer's shared thread");
  const erasedPeer = retainedAfterErasure.thread.participant_1_id === userC.id
    ? retainedAfterErasure.thread.participant_1
    : retainedAfterErasure.thread.participant_2;
  assert(
    erasedPeer?.account_deleted === true && !("deleted_at" in erasedPeer) && !("auth_user_id" in erasedPeer),
    "Retained thread did not expose the safe deleted-account state"
  );
  assert(
    !retainedAfterErasure.messages.some((entry) => entry.id === departingMessage.message.id),
    "Erased authored message remained visible to the peer"
  );
  await api(userA.token, `/api/dm/${nonFriendThread.id}`, {
    method: "POST",
    body: JSON.stringify({ content: "must remain read-only" }),
  }, 410);
  await expectPrivateTopicAccess(
    userA.client,
    `thread:${nonFriendThread.id}`,
    "CHANNEL_ERROR"
  );
  const { data: directDeletedPeerThread, error: directDeletedPeerThreadError } = await userA.client
    .from("dm_threads")
    .select("id")
    .eq("id", nonFriendThread.id)
    .maybeSingle();
  if (directDeletedPeerThreadError) throw directDeletedPeerThreadError;
  assert(directDeletedPeerThread === null, "Deleted-peer thread leaked through direct Data API access");

  const { data: deletedAuthUser } = await admin.auth.admin.getUserById(userC.id);
  assert(!deletedAuthUser.user, "Account erasure retained the Supabase Auth identity");

  if (expectAccountErasure) {
    process.stdout.write("Live security smoke passed: Auth metadata hardening, profile/friendship ACL, server search, atomic chat coins, preserved blocks, Realtime block enforcement, canonical private DM media, DM validation, direct Data/Storage denial, and cross-system account erasure.\n");
  } else {
    process.stdout.write(
      "Live security smoke passed through the account-erasure dependency gate and verified local erasure/read-only history separately; provider erasure remains pending production credentials.\n"
    );
  }
} finally {
  const cleanupErrors = [];
  if (createdStorageObjects.length) {
    const { error } = await admin.storage.from("media").remove(createdStorageObjects);
    if (error) cleanupErrors.push(`Synthetic Storage cleanup failed: ${error.message}`);
  }
  for (const userId of createdUserIds.reverse()) {
    const { error: erasureError } = await admin.rpc("erase_account_data", { p_user_id: userId });
    if (erasureError) cleanupErrors.push(`Synthetic data erasure failed for ${userId}: ${erasureError.message}`);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && error.code !== "user_not_found" && error.status !== 404) {
      cleanupErrors.push(`Synthetic user cleanup failed for ${userId}: ${error.message}`);
    }
  }
  if (cleanupErrors.length) {
    throw new Error(`Live smoke cleanup failed: ${cleanupErrors.join("; ")}`);
  }
}
