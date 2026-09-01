"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Ban, Clock, Flag, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { OtherUserGallery } from "@/features/profile/components/OtherUserGallery";
import { ProfileInterests } from "@/features/profile/components/ProfileInterests";
import { useIsPremium } from "@/stores/selectors";
import { useAuth } from "@/features/auth/useAuth";
import { InsufficientCoinsDialog } from "@/features/coins/components/InsufficientCoinsDialog";
import {
  coinsQueryOptions,
  publicProfileQueryOptions,
  webQueryKeys,
} from "@/data/web-query";
import {
  blockUser,
  discardBlockUser,
  pendingBlockUser,
  sendFriendRequest,
} from "@/data/friend-mutations";
import { createOrFindThread } from "@/data/thread-mutations";
import { commitBlockedUserCache } from "@/data/block-cache";
import { ApiTransportError } from "@peekpoke/shared";

// This page coordinates public-profile queries, actions, and presentation.
// react-doctor-disable-next-line no-giant-component
export default function PublicProfilePage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const router = useRouter();
  const viewerIsPremium = useIsPremium();
  const { user } = useAuth();
  const userId = params.userId as string;

  // The profile request is tied to the route's user id and guarded by cancellation.
  // react-doctor-disable-next-line no-fetch-in-effect
  useEffect(() => {
    if (user?.id && user.id === userId) window.location.replace("/profile");
  }, [user?.id, userId]);
  const coinsQuery = useQuery(coinsQueryOptions);
  const coins = coinsQuery.data?.balance ?? 0;

  const [showNoCoins, setShowNoCoins] = useState(false);
  const [reportCategory, setReportCategory] = useState("other");
  const [safetyStatus, setSafetyStatus] = useState<string | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const blockTargetRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  const publicProfile = useQuery(publicProfileQueryOptions(userId));
  const data = publicProfile.data;
  const loading = publicProfile.isPending;

  const profile = data?.profile;
  const name = profile?.display_name || profile?.username || "User";
  const handle = profile?.username ? `@${profile.username}` : null;
  const avatarUrl = profile?.avatar_url;
  const coverUrl = profile?.cover_image_url;
  const initial = name.slice(0, 1).toUpperCase();
  const friendship = data?.friendship;
  const isFriend = friendship?.status === "accepted";
  const isPending = friendship?.status === "pending";
  const targetIsPremium = profile?.is_premium ?? false;
  const hasPendingBlockRecovery = pendingBlockUser(userId) !== null;

  useEffect(() => {
    blockTargetRef.current = userId;
    return () => {
      if (blockTargetRef.current === userId) blockTargetRef.current = null;
    };
  }, [userId]);

  if (publicProfile.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="t-body text-ink-9">This profile could not be loaded.</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void publicProfile.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  const handleAddFriend = () => {
    if (isPending || isFriend) return;
    if (!coinsQuery.isSuccess) return;
    if (coins < 1) {
      setShowNoCoins(true);
      return;
    }
    startTransition(async () => {
      try {
        await sendFriendRequest(userId, (response) => {
          queryClient.setQueryData(webQueryKeys.coins, { balance: response.balance });
          queryClient.setQueryData(
            webQueryKeys.publicProfile(userId),
            data ? { ...data, friendship: response.friendship } : data,
          );
          void queryClient.invalidateQueries({ queryKey: webQueryKeys.friends });
        });
      } catch (err) {
        if (err instanceof ApiTransportError && err.code === "INSUFFICIENT_COINS") {
          setShowNoCoins(true);
        }
        console.error("Failed to send friend request:", err);
      }
    });
  };

  const handleSendMessage = () => {
    if (!isFriend) return;
    startTransition(async () => {
      try {
        const response = await createOrFindThread(userId);
        queryClient.setQueryData(webQueryKeys.coins, { balance: response.balance });
        const destination = window.matchMedia("(max-width: 767px)").matches
          ? `/chat/${response.id}`
          : `/inbox?tab=chats&thread=${response.id}`;
        router.push(destination);
      } catch (err) {
        console.error("Failed to start DM:", err);
      }
    });
  };

  async function handleReport() {
    if (safetyLoading || !window.confirm("Send this profile to the safety team for review?")) return;
    setSafetyLoading(true);
    setSafetyStatus(null);
    try {
      const response = await fetch(`/api/users/${userId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: reportCategory }),
      });
      if (!response.ok) throw new Error();
      setSafetyStatus("Report received. Thank you for helping keep the community safe.");
    } catch {
      setSafetyStatus("The report could not be sent. Please try again.");
    } finally {
      setSafetyLoading(false);
    }
  }

  function commitBlockedUser() {
    if (blockTargetRef.current !== userId) return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: webQueryKeys.friends }),
      queryClient.invalidateQueries({ queryKey: webQueryKeys.threads }),
    ]);
  }

  async function runBlock(askForConfirmation: boolean) {
    if (
      safetyLoading
      || (askForConfirmation
        && !window.confirm("Block this person? You will no longer be able to interact."))
    ) return;
    setSafetyLoading(true);
    setSafetyStatus(null);
    try {
      await blockUser(userId, (response) => {
        if (blockTargetRef.current !== userId) return;
        commitBlockedUserCache(queryClient, userId, friendship?.id ?? null, response.balance);
        commitBlockedUser();
        router.replace("/");
      });
    } catch (error) {
      if (blockTargetRef.current !== userId) return;
      const pending = pendingBlockUser(userId) !== null;
      setSafetyStatus(pending
        ? "The result is unknown. Retry safely with the same request or discard and refresh."
        : error instanceof ApiTransportError && error.status === 429
          ? "Too many block requests. Wait and try again."
          : "This person could not be blocked. Please try again.");
    } finally {
      // react-doctor-disable-next-line no-loading-flag-reset-outside-finally -- guarded reset is inside finally
      if (blockTargetRef.current === userId) setSafetyLoading(false);
    }
  }

  function discardBlockRecovery() {
    if (!discardBlockUser(userId)) return;
    setSafetyStatus("Pending block request discarded. Current data is being refreshed.");
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: webQueryKeys.friends }),
      queryClient.invalidateQueries({ queryKey: webQueryKeys.threads }),
      queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(userId) }),
      queryClient.invalidateQueries({ queryKey: webQueryKeys.coins }),
    ]);
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Header */}
      <div
        className="relative flex flex-col items-center gap-4 px-6 pt-12 pb-6 bg-cover bg-top bg-no-repeat"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
      >
        {coverUrl && <div className="absolute inset-0 bg-background/80" />}

        <div className="relative z-10 flex flex-col items-center gap-3 w-full">
          {/* Back button */}
          <div className="flex justify-start w-full">
            <button type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="w-9 h-9 rounded-full bg-background shadow-e-1 flex items-center justify-center"
            >
              <ArrowLeft className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
          </div>

          {/* Avatar + halo */}
          <div className="relative mb-5">
              <div className="relative w-20 h-20 rounded-full bg-background shadow-e-2 flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={name} fill sizes="80px" className="object-cover" />
              ) : (
                <span className="text-3xl font-bold text-primary">{initial}</span>
              )}
            </div>
            {!loading && data && (
              <div className="absolute bottom-0 translate-y-1/2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-background shadow-e-1 rounded-full px-3 py-1 text-xs whitespace-nowrap z-10">
                <span className="font-semibold text-primary">{data.stats.friends_count}</span>
                <span className="text-muted-foreground">Friends</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-semibold text-primary">{data.stats.photos_count}</span>
                <span className="text-muted-foreground">Photos</span>
                {profile?.location_text && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="font-semibold text-primary">{profile.location_text}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Name + premium badge */}
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              {loading ? "Loading\u2026" : name}
            </h1>
            {targetIsPremium && <PremiumBadge size="sm" showText />}
          </div>
          {handle && <p className="text-sm text-muted-foreground">{handle}</p>}

          {/* Bio */}
          {profile?.bio && (
            <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* Action buttons */}
          {!loading && data && (
            <div className="flex gap-3 pt-2">
              {isFriend ? (
                <button type="button"
                  onClick={handleSendMessage}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-background shadow-e-1"
                >
                  <span className="text-base leading-none">👋</span>
                  <span className="text-sm font-medium text-primary">Say Hi</span>
                </button>
              ) : isPending ? (
                <div className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-background shadow-e-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Requested</span>
                </div>
              ) : (
                <button type="button"
                  disabled={!coinsQuery.isSuccess}
                  onClick={handleAddFriend}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-ink-9 text-white shadow-e-1 disabled:opacity-60"
                >
                  <UserPlus className="h-4 w-4" />
                  <span className="text-sm font-medium">Add Friend</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {!loading && data && (
        <div className="flex flex-col gap-6 p-6">
          {/* About card */}
          {profile?.bio && (
            <Card className="rounded-md p-4">
              <h3 className="text-[16px] font-semibold text-foreground mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
            </Card>
          )}

          {/* Interests */}
          {data.interests.length > 0 && (
            <Card className="rounded-md p-4">
              <ProfileInterests
                interests={data.interests}
                className="!p-0"
              />
            </Card>
          )}

          {/* Photos */}
          {data.photos.length > 0 && (
            <Card className="rounded-md p-4">
              <OtherUserGallery
                photos={data.photos}
                viewerIsPremium={viewerIsPremium}
                className="!p-0"
              />
            </Card>
          )}

          <Card className="rounded-md p-4 flex flex-col gap-3">
            <h3 className="text-[16px] font-semibold text-foreground">Safety</h3>
            <label className="text-sm text-muted-foreground" htmlFor="report-category">
              Reason for reporting
            </label>
            <select
              id="report-category"
              value={reportCategory}
              onChange={(event) => setReportCategory(event.target.value)}
              className="h-10 rounded-sm border border-hairline bg-background px-3 text-sm text-foreground"
            >
              <option value="spam">Spam or scam</option>
              <option value="harassment">Harassment or threats</option>
              <option value="explicit_content">Inappropriate content</option>
              <option value="impersonation">Impersonation</option>
              <option value="underage">May be underage</option>
              <option value="other">Other safety concern</option>
            </select>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={safetyLoading}
                onClick={() => void handleReport()}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-sm bg-amber-50 text-sm font-semibold text-amber-800 disabled:opacity-60"
              >
                <Flag className="h-4 w-4" /> Report
              </button>
              <button
                type="button"
                disabled={safetyLoading}
                onClick={() => void runBlock(true)}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-sm bg-red-50 text-sm font-semibold text-red-700 disabled:opacity-60"
              >
                <Ban className="h-4 w-4" /> Block
              </button>
            </div>
            {safetyStatus ? <p role="status" className="text-sm text-muted-foreground">{safetyStatus}</p> : null}
            {hasPendingBlockRecovery ? (
              <div className="flex gap-3" role="group" aria-label="Recover pending block request">
                <button
                  type="button"
                  disabled={safetyLoading}
                  onClick={() => void runBlock(false)}
                  className="btn btn-secondary btn-sm flex-1"
                >
                  Retry safely
                </button>
                <button
                  type="button"
                  disabled={safetyLoading}
                  onClick={discardBlockRecovery}
                  className="btn btn-ghost btn-sm flex-1"
                >
                  Discard &amp; refresh
                </button>
              </div>
            ) : null}
          </Card>
        </div>
      )}
      <InsufficientCoinsDialog open={showNoCoins} onOpenChange={setShowNoCoins} />
    </div>
  );
}
