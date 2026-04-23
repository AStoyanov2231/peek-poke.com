"use client";

import { useState, useEffect, useRef } from "react";
import { Pencil, Share2, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProfileInterests } from "./ProfileInterests";
import { PhotoGallery } from "./PhotoGallery";
import { SettingsSheet } from "./SettingsSheet";
import { ShareSheet } from "./ShareSheet";
import { ProfileCover } from "./ProfileCover";
import { ProfileIdentity } from "./ProfileIdentity";
import { ProfileStatsRow } from "./ProfileStatsRow";
import { PremiumCard } from "./PremiumCard";
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
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const profile = isProfileLoaded && storeProfile ? storeProfile : initialProfile;
  const photos = isProfileLoaded ? storePhotos : initialPhotos;
  const interests = isProfileLoaded ? storeInterests : initialInterests;
  const allTags = isProfileLoaded && storeAllTags.length > 0 ? storeAllTags : initialAllTags;
  const stats = isProfileLoaded ? storeStats : initialStats;

  useEffect(() => {
    if (!isProfileLoaded) {
      if (initialProfile) setStoreProfile(initialProfile);
      if (initialPhotos.length > 0) setStorePhotos(initialPhotos);
      if (initialInterests.length > 0) setStoreInterests(initialInterests);
      if (initialAllTags.length > 0) setStoreAllTags(initialAllTags);
      setStoreStats(initialStats);
    }
  }, [isProfileLoaded, initialProfile, initialPhotos, initialInterests, initialAllTags, initialStats, setStoreProfile, setStorePhotos, setStoreInterests, setStoreAllTags, setStoreStats]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleAvatarUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const thumbnail = await createThumbnail(file);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("thumbnail", thumbnail);
      const res = await fetch("/api/profile/photos", { method: "POST", body: formData });
      if (!res.ok) return;
      const data = await res.json();
      setStorePhotos([...photos, data.photo]);
      updateStoreStats({ photos_count: stats.photos_count + 1 });
    } catch (error) {
      console.error("Failed to upload avatar:", error);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const thumbnail = await createThumbnail(file);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("thumbnail", thumbnail);
      const res = await fetch("/api/profile/photos", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setStorePhotos([...photos, data.photo]);
        updateStoreStats({ photos_count: stats.photos_count + 1 });
      } else {
        let errorMessage = "Failed to upload photo. Please try again.";
        try {
          const error = await res.json();
          if (error?.error) errorMessage = error.error;
        } catch { /* noop */ }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Failed to upload photo:", error);
      alert("Failed to upload photo. Please try again.");
    }
  };

  const handlePhotoDelete = async (photoId: string) => {
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, { method: "DELETE" });
      if (res.ok) {
        const deletedPhoto = photos.find((p) => p.id === photoId);
        setStorePhotos(photos.filter((p) => p.id !== photoId));
        updateStoreStats({ photos_count: Math.max(0, stats.photos_count - 1) });
        if (deletedPhoto?.is_avatar) setStoreProfile({ ...profile, avatar_url: null });
      }
    } catch (error) {
      console.error("Failed to delete photo:", error);
    }
  };

  const handleSetAvatar = async (photoId: string) => {
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_avatar: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setStorePhotos(photos.map((p) => ({ ...p, is_avatar: p.id === photoId })));
        setStoreProfile({ ...profile, avatar_url: data.photo.url });
      }
    } catch (error) {
      console.error("Failed to set avatar:", error);
    }
  };

  const handleTogglePrivate = async (photoId: string, isPrivate: boolean) => {
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_private: isPrivate }),
      });
      if (res.ok) setStorePhotos(photos.map((p) => p.id === photoId ? { ...p, is_private: isPrivate } : p));
    } catch (error) {
      console.error("Failed to toggle photo privacy:", error);
    }
  };

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

  const handleRemoveInterest = async (interestId: string) => {
    const res = await fetch(`/api/profile/interests/${interestId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to remove interest");
    setStoreInterests(interests.filter((i) => i.id !== interestId));
  };

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

  const aboutCard = (
    <Card className="p-4 flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h3 className="t-body-b text-ink-9">About</h3>
        {!isBioEditing && (
          <button
            onClick={() => { setEditBioText(profile.bio || ""); setIsBioEditing(true); }}
            className="iconbtn"
            style={{ width: 36, height: 36, borderRadius: "50%" }}
            aria-label="Edit bio"
          >
            <Pencil size={15} strokeWidth={2} />
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
            className="w-full bg-ink-1 border border-hairline rounded-md px-3 py-2 t-body text-ink-8 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex justify-between items-center">
            <span className="t-caption muted">{editBioText.length}/500</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditBioText(profile.bio || ""); setIsBioEditing(false); }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try { await handleBioSave(editBioText); setIsBioEditing(false); } catch { /* keep editing */ }
                }}
                className="btn btn-primary btn-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="t-body muted leading-relaxed">
          {profile.bio || "Tap the pencil to add bio!"}
        </p>
      )}
    </Card>
  );

  const interestsCard = (
    <Card className="p-4 flex flex-col gap-3">
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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleAvatarUpload(file);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        className="hidden"
      />

      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col pb-24">
        <ProfileCover onSettings={() => setShowSettings(true)} />
        <ProfileIdentity
          profile={profile}
          actions={
            <button
              className="iconbtn"
              style={{ width: 36, height: 36, borderRadius: "50%" }}
              onClick={() => { /* navigate to edit */ }}
              aria-label="Edit profile"
            >
              <Pencil size={15} strokeWidth={2} />
            </button>
          }
        />
        <div className="px-6 mt-4">
          <ProfileStatsRow stats={stats} />
        </div>
        <div className="px-6 mt-3">
          <button
            className="btn btn-primary w-full"
            style={{ borderRadius: 12, paddingTop: 14, paddingBottom: 14 }}
            onClick={() => setShowShare(true)}
          >
            <Share2 size={15} strokeWidth={2.25} /> Share profile
          </button>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {aboutCard}
          {interestsCard}
          {!isPremium(profile) && <PremiumCard isPremiumUser={false} />}
          <Card className="p-4 flex flex-col gap-3">
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

      {/* ── DESKTOP ── full-width scrollable page ── */}
      <div className="hidden md:block overflow-y-auto no-scrollbar">
        {/* Cover — full width */}
        <ProfileCover heightDesktop={220} />

        {/* Identity row — overlaps cover by 56px */}
        <ProfileIdentity
          profile={profile}
          avatarSizeDesktop={128}
          actions={
            <>
              <button
                className="iconbtn"
                style={{ width: 36, height: 36, borderRadius: "50%" }}
                onClick={() => { /* navigate to edit */ }}
                aria-label="Edit profile"
              >
                <Pencil size={15} strokeWidth={2} />
              </button>
              <button
                className="btn btn-primary btn-md"
                style={{ borderRadius: 12 }}
                onClick={() => setShowShare(true)}
              >
                <Share2 size={14} strokeWidth={2.25} /> Share
              </button>
              <button
                className="btn btn-secondary btn-md"
                style={{ borderRadius: 12 }}
                onClick={() => setShowSettings(true)}
              >
                <Settings size={14} strokeWidth={2} /> Settings
              </button>
            </>
          }
        />

        {/* Stats */}
        <div className="px-10 mt-6">
          <ProfileStatsRow stats={stats} showMeetings showRadius />
        </div>

        {/* Two-column grid */}
        <div
          className="px-10 py-6 pb-10 grid gap-6"
          style={{ gridTemplateColumns: "1fr 1.6fr" }}
        >
          <div className="flex flex-col gap-4">
            {aboutCard}
            {interestsCard}
            {!isPremium(profile) && <PremiumCard isPremiumUser={false} />}
          </div>
          <Card className="p-4">
            <PhotoGallery
              photos={photos}
              isOwner={true}
              maxPhotos={12}
              onUpload={handlePhotoUpload}
              onDelete={handlePhotoDelete}
              onSetAvatar={handleSetAvatar}
              onTogglePrivate={handleTogglePrivate}
              className="!p-0 [&_.photo-grid]:grid-cols-4"
            />
          </Card>
        </div>
      </div>

      <SettingsSheet open={showSettings} onOpenChange={setShowSettings} />
      <ShareSheet open={showShare} onOpenChange={setShowShare} userId={profile.id} />
    </>
  );
}
