"use client";

import { useState, useEffect, useRef } from "react";
import { Pencil, Share2, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProfileInterests, type ProfileInterestsRef } from "./ProfileInterests";
import { PhotoGallery } from "./PhotoGallery";
import { SettingsSheet } from "./SettingsSheet";
import { ShareSheet } from "./ShareSheet";
import { ProfileCover } from "./ProfileCover";
import { ProfileIdentity } from "./ProfileIdentity";
import { ProfileStatsRow } from "./ProfileStatsRow";
import { OwnerDisplayNameEditor } from "./OwnerDisplayNameEditor";
import { PremiumCard } from "./PremiumCard";
import { compressImage, createThumbnail } from "@/lib/image-compression";
import { useQueryClient } from "@tanstack/react-query";
import {
  deleteOwnerProfilePhoto,
  updateOwnerProfilePhoto,
  uploadOwnerProfileCover,
  uploadOwnerProfilePhoto,
  updateOwnerProfile,
  webQueryKeys,
} from "@/data/web-query";
import {
  createOwnerProfileUpdateCoordinator,
  displayNameLength,
  isPremium,
  MAX_DISPLAY_NAME_LENGTH,
  profileInterestCreateResponseSchema,
  type CurrentProfile,
  type OwnerProfilePhoto,
} from "@peekpoke/shared";
import { fetchContract } from "@/lib/typed-api";
import {
  commitWebOwnerProfileUpdate,
  refreshWebOwnerProfileReferences,
} from "@/data/owner-profile-cache";
import {
  type ProfileInterest,
  type InterestTag,
  type ProfileStats as ProfileStatsType,
} from "@/types/database";

interface ProfilePageClientProps {
  profile: CurrentProfile;
  photos: OwnerProfilePhoto[];
  interests: ProfileInterest[];
  allTags: InterestTag[];
  stats: ProfileStatsType;
}

// This client coordinates profile editing, uploads, and responsive presentation.
// react-doctor-disable-next-line no-giant-component
export function ProfilePageClient({
  profile: initialProfile,
  photos: initialPhotos,
  interests: initialInterests,
  allTags: initialAllTags,
  stats: initialStats,
}: ProfilePageClientProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isMobileProfileEditing, setIsMobileProfileEditing] = useState(false);
  const [isMobileBioEditing, setIsMobileBioEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBioText, setEditBioText] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const interestsRef = useRef<ProfileInterestsRef>(null);
  const [profileUpdateCoordinator] = useState(createOwnerProfileUpdateCoordinator);

  const profile = initialProfile;
  const photos = initialPhotos;
  const interests = initialInterests;
  const allTags = initialAllTags;
  const stats = initialStats;

  const setStoreProfile = (nextProfile: CurrentProfile) => {
    queryClient.setQueryData(webQueryKeys.profile, nextProfile);
  };
  const setStorePhotos = (nextPhotos: OwnerProfilePhoto[]) => {
    queryClient.setQueryData(webQueryKeys.photos, nextPhotos);
  };
  const setStoreInterests = (nextInterests: ProfileInterest[]) => {
    queryClient.setQueryData(webQueryKeys.interests, nextInterests);
  };

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    return () => profileUpdateCoordinator.cancel();
  }, [profileUpdateCoordinator]);

  const handleAvatarUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const thumbnail = await createThumbnail(file);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("thumbnail", thumbnail);
      const photo = await uploadOwnerProfilePhoto(formData);
      setStorePhotos([...photos, photo]);
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
      const photo = await uploadOwnerProfilePhoto(formData);
      setStorePhotos([...photos, photo]);
    } catch (error) {
      console.error("Failed to upload photo:", error);
      alert("Failed to upload photo. Please try again.");
    }
  };

  const handleCoverUpload = async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const photo = await uploadOwnerProfileCover(formData);
      setStorePhotos([...photos, photo]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: webQueryKeys.photos }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.profile }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(profile.id) }),
      ]);
      alert("Cover submitted for review. Your current cover stays visible until approval.");
    } catch (error) {
      console.error("Failed to upload cover:", error);
      alert("Failed to upload cover photo. Please try again.");
    }
  };

  const handlePhotoDelete = async (photoId: string) => {
    try {
      await deleteOwnerProfilePhoto(photoId);
      const deletedPhoto = photos.find((p) => p.id === photoId);
      setStorePhotos(photos.filter((p) => p.id !== photoId));
      if (deletedPhoto?.is_avatar) setStoreProfile({ ...profile, avatar_url: null });
      if (deletedPhoto?.is_cover) setStoreProfile({ ...profile, cover_image_url: null });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: webQueryKeys.profile }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(profile.id) }),
      ]);
    } catch (error) {
      console.error("Failed to delete photo:", error);
    }
  };

  const handleSetAvatar = async (photoId: string) => {
    try {
      const photo = await updateOwnerProfilePhoto(photoId, { is_avatar: true });
      setStorePhotos(photos.map((item) => ({ ...item, is_avatar: item.id === photoId })));
      setStoreProfile({ ...profile, avatar_url: photo.url });
    } catch (error) {
      console.error("Failed to set avatar:", error);
    }
  };

  const handleTogglePrivate = async (photoId: string, isPrivate: boolean) => {
    try {
      const photo = await updateOwnerProfilePhoto(photoId, { is_private: isPrivate });
      setStorePhotos(photos.map((item) => item.id === photoId ? photo : item));
      const previous = photos.find((item) => item.id === photoId);
      if (isPrivate && previous && (previous.is_avatar || previous.is_cover)) {
        setStoreProfile({
          ...profile,
          avatar_url: previous.is_avatar ? null : profile.avatar_url,
          cover_image_url: previous.is_cover ? null : profile.cover_image_url,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: webQueryKeys.profile }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(profile.id) }),
      ]);
    } catch (error) {
      console.error("Failed to toggle photo privacy:", error);
    }
  };

  const handleAddInterest = async (tagId: string) => {
    const data = await fetchContract("/api/profile/interests", profileInterestCreateResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId }),
    });
    setStoreInterests([...interests, data.interest]);
  };

  const handleRemoveInterest = async (interestId: string) => {
    const res = await fetch(`/api/profile/interests/${interestId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to remove interest");
    setStoreInterests(interests.filter((i) => i.id !== interestId));
  };

  const beginProfileEdit = (mobile: boolean) => {
    profileUpdateCoordinator.cancel();
    setEditDisplayName(profile.display_name ?? profile.username);
    setEditBioText(profile.bio ?? "");
    setProfileSaveError(null);
    setIsMobileBioEditing(false);
    if (mobile) setIsMobileProfileEditing(true);
    else setIsEditing(true);
  };

  const cancelProfileEdit = () => {
    profileUpdateCoordinator.cancel();
    setEditDisplayName(profile.display_name ?? profile.username);
    setEditBioText(profile.bio ?? "");
    setIsSavingProfile(false);
    setProfileSaveError(null);
    setIsEditing(false);
    setIsMobileProfileEditing(false);
    setIsMobileBioEditing(false);
  };

  const handleProfileSave = async (updates: { display_name?: string; bio?: string }) => {
    const ownerId = profile.id;
    const attempt = profileUpdateCoordinator.begin(ownerId);
    setIsSavingProfile(true);
    setProfileSaveError(null);
    try {
      const updatedProfile = await updateOwnerProfile(updates, attempt.signal);
      const currentOwnerId = queryClient.getQueryData<CurrentProfile>(webQueryKeys.profile)?.id ?? "";
      if (!profileUpdateCoordinator.isCurrent(attempt, currentOwnerId)) return false;
      if (!commitWebOwnerProfileUpdate(queryClient, ownerId, updatedProfile)) {
        profileUpdateCoordinator.finish(attempt, currentOwnerId);
        setIsSavingProfile(false);
        setProfileSaveError("The server returned a profile for a different account. Try again.");
        return false;
      }
      profileUpdateCoordinator.finish(attempt, currentOwnerId);
      setIsSavingProfile(false);
      try {
        await refreshWebOwnerProfileReferences(queryClient, ownerId);
      } catch (refreshError) {
        console.error("Profile reference refresh failed", refreshError);
      }
      return true;
    } catch (error) {
      const currentOwnerId = queryClient.getQueryData<CurrentProfile>(webQueryKeys.profile)?.id ?? "";
      if (!profileUpdateCoordinator.isCurrent(attempt, currentOwnerId)) return false;
      profileUpdateCoordinator.finish(attempt, currentOwnerId);
      setIsSavingProfile(false);
      setProfileSaveError(error instanceof Error ? error.message : "Your profile could not be saved. Try again.");
      return false;
    }
  };

  const aboutCard = (
    <Card className="p-4 flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h3 className="t-body-b text-ink-9">About</h3>
        {!isMobileBioEditing && (
          <button type="button"
            onClick={() => {
              profileUpdateCoordinator.cancel();
              setEditBioText(profile.bio || "");
              setProfileSaveError(null);
              setIsMobileProfileEditing(false);
              setIsMobileBioEditing(true);
            }}
            className="iconbtn"
            style={{ width: 44, height: 44, borderRadius: "50%" }}
            aria-label="Edit bio"
          >
            <Pencil size={15} strokeWidth={2} />
          </button>
        )}
      </div>
      {isMobileBioEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={editBioText}
            onChange={(e) => setEditBioText(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            placeholder="Write something about yourself..."
            className="w-full bg-ink-1 border border-hairline rounded-md px-3 py-2 t-body text-ink-8 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex justify-between items-center">
            <span className="t-caption muted">{editBioText.length}/500</span>
            <div className="flex gap-2">
              <button type="button"
                onClick={cancelProfileEdit}
                className="btn btn-secondary btn-sm min-h-11"
                disabled={isSavingProfile}
              >
                Cancel
              </button>
              <button type="button"
                onClick={async () => {
                  if (await handleProfileSave({ bio: editBioText })) setIsMobileBioEditing(false);
                }}
                className="btn btn-primary btn-sm min-h-11"
                disabled={isSavingProfile}
              >
                {isSavingProfile ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
          {profileSaveError ? <p role="alert" className="t-caption text-danger-600">{profileSaveError}</p> : null}
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
        owner={{}}
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
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) await handleCoverUpload(file);
          if (coverInputRef.current) coverInputRef.current.value = "";
        }}
        className="hidden"
      />

      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col pb-24">
        <ProfileCover
          coverImageUrl={profile.cover_image_url}
          onEditCover={() => coverInputRef.current?.click()}
          onSettings={() => setShowSettings(true)}
        />
        <ProfileIdentity
          profile={profile}
          actions={
            <button type="button"
              className="iconbtn"
              style={{ width: 44, height: 44, borderRadius: "50%" }}
              onClick={() => beginProfileEdit(true)}
              aria-label="Edit profile"
            >
              <Pencil size={15} strokeWidth={2} />
            </button>
          }
        />
        {isMobileProfileEditing ? (
          <div className="px-6 mt-3">
            <Card className="p-4 flex flex-col gap-3">
              <OwnerDisplayNameEditor
                error={profileSaveError}
                id="mobile-display-name"
                onCancel={cancelProfileEdit}
                onChange={setEditDisplayName}
                onSave={() => {
                  void handleProfileSave({ display_name: editDisplayName }).then((saved) => {
                    if (saved) setIsMobileProfileEditing(false);
                  });
                }}
                saving={isSavingProfile}
                value={editDisplayName}
              />
            </Card>
          </div>
        ) : null}
        <div className="px-6 mt-4">
          <ProfileStatsRow stats={stats} />
        </div>
        <div className="px-6 mt-3">
          <button type="button"
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
          <PremiumCard isPremiumUser={isPremium(profile)} />
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
        {/* Identity row */}
        <ProfileIdentity
          profile={profile}
          avatarSizeDesktop={128}
          stats={stats}
          actions={
            <>
              <button type="button"
                className="btn btn-secondary btn-md"
                style={{ borderRadius: 12 }}
                onClick={() => beginProfileEdit(false)}
              >
                <Pencil size={14} strokeWidth={2} /> Edit
              </button>
              <button type="button"
                className="btn btn-primary btn-md"
                style={{ borderRadius: 12 }}
                onClick={() => setShowShare(true)}
              >
                <Share2 size={14} strokeWidth={2.25} /> Share
              </button>
              <button type="button"
                className="btn btn-secondary btn-md"
                style={{ borderRadius: 12 }}
                onClick={() => setShowSettings(true)}
              >
                <Settings size={14} strokeWidth={2} /> Settings
              </button>
            </>
          }
        />

        {/* Two-column grid */}
        <div
          className="px-10 py-6 pb-10 grid gap-6"
          style={{ gridTemplateColumns: "1fr 1.6fr" }}
        >
          <div className="flex flex-col gap-4">
            {/* Combined profile card */}
            <Card className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="t-body-b text-ink-9">Profile</h3>
                {isEditing && (
                  <div className="flex gap-2">
                    <button type="button" disabled={isSavingProfile} onClick={cancelProfileEdit} className="btn btn-secondary btn-sm min-h-11">Cancel</button>
                    <button type="button"
                      onClick={async () => {
                        if (await handleProfileSave({ display_name: editDisplayName, bio: editBioText })) {
                          await interestsRef.current?.save();
                          setIsEditing(false);
                        }
                      }}
                      disabled={isSavingProfile}
                      className="btn btn-primary btn-sm min-h-11"
                    >
                      {isSavingProfile ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="desktop-display-name" className="t-caption text-ink-8">Display name</label>
                  <input
                    id="desktop-display-name"
                    value={editDisplayName}
                    onChange={(event) => setEditDisplayName(Array.from(event.target.value).slice(0, MAX_DISPLAY_NAME_LENGTH).join(""))}
                    autoComplete="name"
                    aria-describedby="desktop-display-name-count"
                    className="w-full bg-ink-1 border border-hairline rounded-md px-3 py-2 t-body text-ink-8 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <span id="desktop-display-name-count" className="t-caption muted text-right">
                    {displayNameLength(editDisplayName)}/{MAX_DISPLAY_NAME_LENGTH}
                  </span>
                </div>
              ) : null}
              {isEditing ? (
                <textarea
                  aria-label="Bio"
                  value={editBioText}
                  onChange={(e) => setEditBioText(e.target.value.slice(0, 500))}
                  maxLength={500}
                  rows={3}
                  placeholder="Write something about yourself..."
                  className="w-full bg-ink-1 border border-hairline rounded-md px-3 py-2 t-body text-ink-8 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              ) : (
                <p className="t-body muted leading-relaxed">
                  {profile.bio || "Add a bio to tell others about yourself."}
                </p>
              )}
              {profileSaveError && isEditing ? <p role="alert" className="t-caption text-danger-600">{profileSaveError}</p> : null}
              <div className="border-t border-hairline pt-1">
                <ProfileInterests
                  ref={interestsRef}
                  interests={interests}
                  allTags={allTags}
                  owner={{ editing: isEditing, onDone: () => setIsEditing(false), hideEditButton: true }}
                  onAddInterest={handleAddInterest}
                  onRemoveInterest={handleRemoveInterest}
                  hideTitle={true}
                  className="!p-0"
                />
              </div>
            </Card>
            <div className={`transition-opacity duration-300 ${isEditing ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
              <PremiumCard isPremiumUser={isPremium(profile)} />
            </div>
          </div>

          {/* Pinterest-style gallery */}
          <PhotoGallery
            photos={photos}
            isOwner={true}
            maxPhotos={12}
            masonry
            onUpload={handlePhotoUpload}
            onDelete={handlePhotoDelete}
            onSetAvatar={handleSetAvatar}
            onTogglePrivate={handleTogglePrivate}
            className="!px-0"
          />
        </div>
      </div>

      <SettingsSheet open={showSettings} onOpenChange={setShowSettings} />
      <ShareSheet open={showShare} onOpenChange={setShowShare} />
    </>
  );
}
