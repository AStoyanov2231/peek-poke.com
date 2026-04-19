"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Pencil, Share2 } from "lucide-react";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Card } from "@/components/ui/card";
import { ProfileInterests } from "./ProfileInterests";
import { PhotoGallery } from "./PhotoGallery";
import { PremiumUpgradeButton } from "./PremiumUpgradeButton";
import { SettingsSheet } from "./SettingsSheet";
import { ShareSheet } from "./ShareSheet";
import { compressImage, createThumbnail } from "@/lib/image-compression";
import { useAppStore } from "@/stores/appStore";
import {
  useProfile as useStoreProfile,
  usePhotos as useStorePhotos,
  useInterests as useStoreInterests,
  useAllTags as useStoreAllTags,
  useProfileStats as useStoreStats,
  useIsProfileLoaded,
} from "@/stores/selectors";
import {
  isPremium,
  type Profile,
  type ProfilePhoto,
  type ProfileInterest,
  type InterestTag,
  type ProfileStats as ProfileStatsType,
} from "@/types/database";

interface ProfilePageClientProps {
  profile: Profile;
  photos: ProfilePhoto[];
  interests: ProfileInterest[];
  allTags: InterestTag[];
  stats: ProfileStatsType;
}

export function ProfilePageClient({
  profile: initialProfile,
  photos: initialPhotos,
  interests: initialInterests,
  allTags: initialAllTags,
  stats: initialStats,
}: ProfilePageClientProps) {
  const [isBioEditing, setIsBioEditing] = useState(false);
  const [editBioText, setEditBioText] = useState("");

  // Get store data and actions
  const storeProfile = useStoreProfile();
  const storePhotos = useStorePhotos();
  const storeInterests = useStoreInterests();
  const storeAllTags = useStoreAllTags();
  const storeStats = useStoreStats();
  const isProfileLoaded = useIsProfileLoaded();

  const setStoreProfile = useAppStore((s) => s.setProfile);
  const setStorePhotos = useAppStore((s) => s.setPhotos);
  const setStoreInterests = useAppStore((s) => s.setInterests);
  const setStoreAllTags = useAppStore((s) => s.setAllTags);
  const setStoreStats = useAppStore((s) => s.setStats);
  const updateStoreStats = useAppStore((s) => s.updateStats);

  // Use store data if loaded, otherwise fall back to SSR props
  const profile = isProfileLoaded && storeProfile ? storeProfile : initialProfile;
  const photos = isProfileLoaded ? storePhotos : initialPhotos;
  const interests = isProfileLoaded ? storeInterests : initialInterests;
  const allTags = isProfileLoaded && storeAllTags.length > 0 ? storeAllTags : initialAllTags;
  const stats = isProfileLoaded ? storeStats : initialStats;

  // Sync SSR data to store on mount if store is empty
  useEffect(() => {
    if (!isProfileLoaded) {
      if (initialProfile) setStoreProfile(initialProfile);
      if (initialPhotos.length > 0) setStorePhotos(initialPhotos);
      if (initialInterests.length > 0) setStoreInterests(initialInterests);
      if (initialAllTags.length > 0) setStoreAllTags(initialAllTags);
      setStoreStats(initialStats);
    }
  }, [
    isProfileLoaded,
    initialProfile,
    initialPhotos,
    initialInterests,
    initialAllTags,
    initialStats,
    setStoreProfile,
    setStorePhotos,
    setStoreInterests,
    setStoreAllTags,
    setStoreStats,
  ]);

  // Fix: Refresh page when restored from bfcache (user pressed back from Stripe)
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Avatar upload handler
  const handleAvatarUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const thumbnail = await createThumbnail(file);

      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("thumbnail", thumbnail);

      const res = await fetch("/api/profile/photos", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) return;

      const data = await res.json();
      setStorePhotos([...photos, data.photo]);
      updateStoreStats({ photos_count: stats.photos_count + 1 });
    } catch (error) {
      console.error("Failed to upload avatar:", error);
    }
  };

  // Photo upload handler
  const handlePhotoUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const thumbnail = await createThumbnail(file);

      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("thumbnail", thumbnail);

      const res = await fetch("/api/profile/photos", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setStorePhotos([...photos, data.photo]);
        updateStoreStats({ photos_count: stats.photos_count + 1 });
      } else {
        let errorMessage = "Failed to upload photo. Please try again.";
        try {
          const error = await res.json();
          console.error("Upload failed:", error);
          if (error?.error) {
            errorMessage = error.error;
          }
        } catch {
          console.error("Upload failed with status:", res.status);
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Failed to upload photo:", error);
      alert("Failed to upload photo. Please try again.");
    }
  };

  // Photo delete handler
  const handlePhotoDelete = async (photoId: string) => {
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const deletedPhoto = photos.find((p) => p.id === photoId);
        setStorePhotos(photos.filter((p) => p.id !== photoId));
        updateStoreStats({ photos_count: Math.max(0, stats.photos_count - 1) });

        if (deletedPhoto?.is_avatar) {
          setStoreProfile({ ...profile, avatar_url: null });
        }
      }
    } catch (error) {
      console.error("Failed to delete photo:", error);
    }
  };

  // Set photo as avatar handler
  const handleSetAvatar = async (photoId: string) => {
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_avatar: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setStorePhotos(
          photos.map((p) => ({
            ...p,
            is_avatar: p.id === photoId,
          }))
        );
        setStoreProfile({ ...profile, avatar_url: data.photo.url });
      }
    } catch (error) {
      console.error("Failed to set avatar:", error);
    }
  };

  // Toggle photo privacy handler
  const handleTogglePrivate = async (photoId: string, isPrivate: boolean) => {
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_private: isPrivate }),
      });

      if (res.ok) {
        setStorePhotos(
          photos.map((p) =>
            p.id === photoId ? { ...p, is_private: isPrivate } : p
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle photo privacy:", error);
    }
  };

  // Add interest handler
  const handleAddInterest = async (tagId: string) => {
    const res = await fetch("/api/profile/interests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId }),
    });

    if (!res.ok) throw new Error("Failed to add interest");

    const data = await res.json();
    setStoreInterests([...interests, data.interest]);
  };

  // Remove interest handler
  const handleRemoveInterest = async (interestId: string) => {
    const res = await fetch(`/api/profile/interests/${interestId}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Failed to remove interest");

    setStoreInterests(interests.filter((i) => i.id !== interestId));
  };

  // Bio save handler
  const handleBioSave = async (newBio: string) => {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio: newBio }),
    });

    if (res.ok) {
      const data = await res.json();
      setStoreProfile(data.profile);
    } else {
      throw new Error("Failed to update bio");
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleAvatarUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const displayName = profile.display_name || profile.username;

  const statsRow = (
    <div className="flex justify-around w-full pt-3">
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-[22px] font-bold text-primary">{stats.friends_count}</span>
        <span className="text-xs text-muted-foreground">Friends</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-[22px] font-bold text-primary">{stats.photos_count}</span>
        <span className="text-xs text-muted-foreground">Photos</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-[22px] font-bold text-primary">{profile.location_text || "—"}</span>
        <span className="text-xs text-muted-foreground">Location</span>
      </div>
    </div>
  );

  const aboutCard = (
    <Card className="rounded-md p-4 flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h3 className="text-[16px] font-semibold text-foreground">About</h3>
        {!isBioEditing && (
          <button
            onClick={() => { setEditBioText(profile.bio || ""); setIsBioEditing(true); }}
            className="bg-primary-gradient rounded-sm px-3 py-1.5 text-xs font-medium text-white flex items-center gap-1.5 shadow-neu-raised-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>
      {isBioEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={editBioText}
            onChange={(e) => setEditBioText(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="Write something about yourself..."
            className="w-full bg-background shadow-neu-inset rounded-sm px-3 py-2 text-sm text-foreground resize-none focus:outline-none"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{editBioText.length}/500</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditBioText(profile.bio || ""); setIsBioEditing(false); }}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-background shadow-neu-raised-sm rounded-[10px]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try { await handleBioSave(editBioText); setIsBioEditing(false); } catch { /* keep editing */ }
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-gradient shadow-neu-raised-sm rounded-[10px]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {profile.bio || "Tap the pencil to add bio!"}
        </p>
      )}
    </Card>
  );

  const interestsCard = (
    <Card className="rounded-md p-4 flex flex-col gap-3">
      <ProfileInterests
        interests={interests}
        allTags={allTags}
        isOwner={true}
        onAddInterest={handleAddInterest}
        onRemoveInterest={handleRemoveInterest}
        className="!p-0"
      />
    </Card>
  );

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* ── MOBILE ── */}
      <div className="md:hidden pb-16">
        <div
          className="relative flex flex-col items-center gap-4 px-6 pt-12 pb-6 bg-cover bg-top bg-no-repeat"
          style={profile.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : {}}
        >
          {profile.avatar_url && <div className="absolute inset-0 bg-background/80" />}
          <div className="relative z-10 flex flex-col items-center gap-4 w-full">
            <div className="flex justify-between w-full">
              <button
                onClick={() => setShowSettings(true)}
                className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
              >
                <Settings className="h-[18px] w-[18px] text-muted-foreground" />
              </button>
              <button
                onClick={() => setShowShare(true)}
                className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
              >
                <Share2 className="h-[18px] w-[18px] text-muted-foreground" />
              </button>
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">{displayName}</h1>
            {isPremium(profile) && <PremiumBadge showText />}
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            {!isPremium(profile) && <PremiumUpgradeButton />}
            {statsRow}
          </div>
        </div>
        <div className="flex flex-col gap-6 p-6">
          {aboutCard}
          {interestsCard}
          <Card className="rounded-md p-4 flex flex-col gap-3">
            <PhotoGallery
              photos={photos}
              isOwner={true}
              maxPhotos={12}
              onUpload={handlePhotoUpload}
              onDelete={handlePhotoDelete}
              onSetAvatar={handleSetAvatar}
              onTogglePrivate={handleTogglePrivate}
              className="!p-0"
            />
          </Card>
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex h-[100svh] overflow-hidden">
        {/* Left column */}
        <div className="w-1/2 flex-shrink-0 flex flex-col gap-4 p-6 border-r border-border overflow-hidden">
          <div className="flex justify-between">
            <button
              onClick={() => setShowShare(true)}
              className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
            >
              <Share2 className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-full bg-background shadow-neu-raised-sm flex items-center justify-center"
            >
              <Settings className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-32 h-32 rounded-full overflow-hidden flex-shrink-0 shadow-neu-raised-sm">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/10">
                  <span className="text-4xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">{displayName}</h1>
            {isPremium(profile) && <PremiumBadge showText />}
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            {!isPremium(profile) && <PremiumUpgradeButton />}
          </div>

          {statsRow}
          <div className="flex gap-4 flex-1 min-h-0">
            <div className="flex-1 min-w-0 p-1">{aboutCard}</div>
            <div className="flex-1 min-w-0 p-1">{interestsCard}</div>
          </div>
        </div>

        {/* Right column — gallery */}
        <div className="flex-1 flex flex-col min-h-0 p-6">
          <Card className="flex-1 min-h-0 flex flex-col rounded-md p-4">
            <PhotoGallery
              photos={photos}
              isOwner={true}
              maxPhotos={12}
              onUpload={handlePhotoUpload}
              onDelete={handlePhotoDelete}
              onSetAvatar={handleSetAvatar}
              onTogglePrivate={handleTogglePrivate}
              className="!p-0 flex-1 min-h-0 overflow-y-auto scrollbar-hide"
            />
          </Card>
        </div>
      </div>

      <SettingsSheet open={showSettings} onOpenChange={setShowSettings} />
      <ShareSheet open={showShare} onOpenChange={setShowShare} userId={profile.id} />
    </>
  );
}
