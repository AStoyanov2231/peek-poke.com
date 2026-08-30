import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (process.env.LIVE_REALTIME_SMOKE_CONFIRM !== "1") {
  throw new Error(
    "Set LIVE_REALTIME_SMOKE_CONFIRM=1 to run the guarded live Realtime smoke test"
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase URL, publishable key, and service-role key are required");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const email = `codex-realtime-${suffix}@example.com`;
const password = `S!${randomBytes(24).toString("base64url")}`;
let userId = null;
let client = null;
const channels = [];

async function expectSubscription(channel, expected) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Private Realtime subscription timed out; expected ${expected}`)),
      15_000
    );

    channel.subscribe((status, error) => {
      if (status === expected) {
        clearTimeout(timeout);
        resolve();
      } else if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(
          error ?? new Error(`Private Realtime subscription was ${status}; expected ${expected}`)
        );
      }
    });
  });
}

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { synthetic_security_test: true },
  });
  if (createError || !created.user) {
    throw createError ?? new Error("Synthetic Realtime user creation failed");
  }
  userId = created.user.id;

  client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session) {
    throw signInError ?? new Error("Synthetic Realtime sign-in failed");
  }

  await client.realtime.setAuth(signedIn.session.access_token);
  const presenceChannel = client.channel("online-users", {
    config: {
      private: true,
      presence: { key: userId },
    },
  });
  channels.push(presenceChannel);
  presenceChannel.on("presence", { event: "sync" }, () => undefined);
  await expectSubscription(presenceChannel, "SUBSCRIBED");

  const trackStatus = await presenceChannel.track({
    user_id: userId,
    online_at: new Date().toISOString(),
  });
  if (trackStatus !== "ok") {
    throw new Error(`Private Presence tracking failed: ${trackStatus}`);
  }

  if (process.env.LIVE_REALTIME_EXPECT_USER_SYNC === "1") {
    let receiveOwnSync = null;
    const ownSyncChannel = client
      .channel(`sync:user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "friendships-changed" }, (payload) => {
        receiveOwnSync?.(payload);
      });
    channels.push(ownSyncChannel);
    await expectSubscription(ownSyncChannel, "SUBSCRIBED");

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          receiveOwnSync = null;
          reject(new Error("Own-user sync broadcast was not delivered"));
        },
        10_000
      );
      receiveOwnSync = () => {
        clearTimeout(timeout);
        receiveOwnSync = null;
        resolve();
      };

      fetch(
        `${supabaseUrl}/realtime/v1/api/broadcast/${encodeURIComponent(`sync:user:${userId}`)}/events/friendships-changed?private=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({ changed: true }),
        }
      ).then((response) => {
        if (!response.ok) {
          clearTimeout(timeout);
          receiveOwnSync = null;
          reject(new Error(`Server sync broadcast failed with ${response.status}`));
        }
      }, (error) => {
        clearTimeout(timeout);
        receiveOwnSync = null;
        reject(error);
      });
    });

    const crossUserSyncChannel = client
      .channel(`sync:user:${randomUUID()}`, { config: { private: true } })
      .on("broadcast", { event: "friendships-changed" }, () => undefined);
    channels.push(crossUserSyncChannel);
    await expectSubscription(crossUserSyncChannel, "CHANNEL_ERROR");
  }

  const userSyncResult =
    process.env.LIVE_REALTIME_EXPECT_USER_SYNC === "1"
      ? " Own-user sync joined and cross-user sync was denied."
      : "";
  process.stdout.write(
    `Live Realtime auth smoke passed: a synthetic authenticated user joined and tracked private Presence.${userSyncResult}\n`
  );
} finally {
  if (client) {
    for (const channel of channels.reverse()) {
      await channel.untrack().catch(() => undefined);
      await client.removeChannel(channel).catch(() => undefined);
    }
  }
  client?.realtime.disconnect();

  if (userId) {
    const { error: erasureError } = await admin.rpc("erase_account_data", {
      p_user_id: userId,
    });
    if (erasureError) {
      throw new Error(`Synthetic Realtime data erasure failed: ${erasureError.message}`);
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && error.code !== "user_not_found" && error.status !== 404) {
      throw new Error(`Synthetic Realtime user cleanup failed: ${error.message}`);
    }
  }
}
