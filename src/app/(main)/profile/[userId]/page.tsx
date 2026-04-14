"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, MessageCircle, UserCheck, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { OtherUserGallery } from "@/components/profile/OtherUserGallery";
import { ProfileInterests } from "@/components/profile/ProfileInterests";
import { useIsPremium } from "@/stores/selectors";
import { useAppStore } from "@/stores/appStore";
import { isPremium as checkPremium } from "@/types/database";
import { InsufficientCoinsDialog } from "@/components/coins/InsufficientCoinsDialog";
import type { Profile, ProfilePhoto, ProfileInterest, ProfileStats, Friendship } from "@/types/database";

interface PublicProfileData {
  profile: Profile | null;
  photos: ProfilePhoto[];
  interests: ProfileInterest[];
  stats: ProfileStats;
  friendship: Friendship | null;
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const viewerIsPremium = useIsPremium();
  const userId = params.userId as string;
  const addSentRequestFull = useAppStore((s) => s.addSentRequestFull);
  const setCoins = useAppStore((s) => s.setCoins);
  const coins = useAppStore((s) => s.coins);

  const [loading, setLoading] = useState(true);
  const [showNoCoins, setShowNoCoins] = useState(false);
  const [data, setData] = useState<PublicProfileData | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    fetch(`/api/profile/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        setData({
          profile: d.profile ?? null,
          photos: d.photos || [],
          interests: d.interests || [],
          stats: d.stats || { photos_count: 0, friends_count: 0 },
          friendship: d.friendship ?? null,
        });
      })
      .catch(() => setData({ profile: null, photos: [], interests: [], stats: { photos_count: 0, friends_count: 0 }, friendship: null }))
      .finally(() => setLoading(false));
  }, [userId]);

  const profile = data?.profile;
  const name = profile?.display_name || profile?.username || "User";
  const handle = profile?.username ? `@${profile.username}` : null;
  const avatarUrl = profile?.avatar_url;
  const initial = name.slice(0, 1).toUpperCase();
  const friendship = data?.friendship;
  const isFriend = friendship?.status === "accepted";
  const isPending = friendship?.status === "pending";
  const targetIsPremium = profile ? checkPremium(profile) : false;

  const handleAddFriend = () => {
    if (isPending || isFriend) return;
    if (coins < 1) {
      setShowNoCoins(true);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addressee_id: userId }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.balance !== undefined) setCoins(d.balance);
          addSentRequestFull({
            ...d.friendship,
            addressee: {
              id: userId,
              username: profile?.username,
              display_name: profile?.display_name,
              avatar_url: profile?.avatar_url,
            },
          });
          setData((prev) =>
            prev ? { ...prev, friendship: d.friendship } : prev
          );
        } else {
          const d = await res.json();
          if (d.error === "INSUFFICIENT_COINS") setShowNoCoins(true);
        }
      } catch (err) {
        console.error("Failed to send friend request:", err);
      }
    });
  };

  const handleSendMessage = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/dm/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        if (res.ok) {
          const d = await res.json();
          window.location.href = `/chat/${d.thread_id}`;
        }
      } catch (err) {
        console.error("Failed to start DM:", err);
      }
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Header */}
      <div
        className="relative flex flex-col items-center gap-4 px-6 pt-12 pb-6 bg-cover bg-top bg-no-repeat"
        style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : {}}
      >
        {avatarUrl && <div className="absolute inset-0 bg-background/80" />}

        <div className="relative z-10 flex flex-col items-center gap-3 w-full">
          {/* Back button */}
          <div className="flex justify-start w-full">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
            >
              <ArrowLeft className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
          </div>

          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-background shadow-neu-raised flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">{initial}</span>
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

          {/* Stats row */}
          {!loading && data && (
            <div className="flex justify-around w-full pt-3">
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-display text-[22px] font-bold text-primary">{data.stats.friends_count}</span>
                <span className="text-xs text-muted-foreground">Friends</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-display text-[22px] font-bold text-primary">{data.stats.photos_count}</span>
                <span className="text-xs text-muted-foreground">Photos</span>
              </div>
              {profile?.location_text && (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-display text-[22px] font-bold text-primary">{profile.location_text}</span>
                  <span className="text-xs text-muted-foreground">Location</span>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {!loading && data && (
            <div className="flex gap-3 pt-2">
              {isFriend ? (
                <div className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-background shadow-neu-raised-sm">
                  <UserCheck className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Friends</span>
                </div>
              ) : isPending ? (
                <div className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-background shadow-neu-raised-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Requested</span>
                </div>
              ) : (
                <button
                  onClick={handleAddFriend}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-white shadow-neu-raised-sm"
                >
                  <UserPlus className="h-4 w-4" />
                  <span className="text-sm font-medium">Add Friend</span>
                </button>
              )}
              {(isFriend || viewerIsPremium) && (
                <button
                  onClick={handleSendMessage}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-background shadow-neu-raised-sm"
                >
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Message</span>
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
                isOwner={false}
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
        </div>
      )}
      <InsufficientCoinsDialog open={showNoCoins} onOpenChange={setShowNoCoins} />
    </div>
  );
}
