import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, type ErrorBoundaryProps } from "expo-router";
import MoreVertical from "lucide-react-native/icons/ellipsis-vertical";
import X from "lucide-react-native/icons/x";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  isPremium,
  createOwnerProfileUpdateCoordinator,
  MAX_BIO_LENGTH,
  MAX_PROFILE_PHOTOS,
  type OwnerProfilePhoto,
} from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { PhotoViewer, SettingsSheet, ShareSheet } from "@/components/profile-overlays";
import { PhotoActionsDialog } from "@/components/photo-actions-dialog";
import {
  Avatar,
  Body,
  BodyBold,
  Button,
  Card,
  Caption,
  IconButton,
  IconGlyph,
  Muted,
  PremiumBadge,
  Screen,
  SectionTitle,
  Title,
} from "@/components/ui";
import { displayName } from "@/components/ui-helpers";
import {
  addProfileInterest,
  deleteProfileInterest,
  deleteProfilePhoto,
  fetchCurrentProfile,
  fetchInterestTags,
  fetchProfileInterests,
  fetchProfilePhotos,
  fetchPublicProfile,
  updateProfile,
  updateProfilePhoto,
  uploadProfileCover,
  uploadProfilePhoto,
} from "@/data/profile/api";
import {
  commitNativeOwnerProfileUpdate,
  mergePhoto,
  refreshNativeOwnerProfileReferences,
  removeInterest,
  removePhoto,
} from "@/data/profile/cache";
import { nativeQueryKeys } from "@/data/query-keys";
import { deleteCurrentAccount } from "@/data/account-deletion";
import { joinedYear } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { RouteErrorRecovery } from "@/components/error-recovery";
import { OwnerDisplayNameEditor } from "@/components/owner-display-name-editor";
import {
  captureCurrentPushAuth,
  unregisterForPushNotifications,
} from "@/lib/push";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorRecovery {...props} title="Couldn't load profile" />;
}

const interestColors = [
  { bg: "#EDE9FF", text: "#6C63FF" },
  { bg: "#E6F9F0", text: "#2F9461" },
  { bg: "#FEF3E2", text: "#A85A20" },
  { bg: "#FEE8E8", text: "#B93636" },
  { bg: "#E8F4FD", text: "#2B6CB0" },
  { bg: "#E6FFFA", text: "#2C7A7B" },
] as const;

const categoryEmoji: Record<string, string> = {
  "Food & Drink": "🍕",
  Outdoors: "🌿",
  Hobbies: "🎨",
  Entertainment: "🎬",
  Culture: "🏛️",
  Health: "💪",
  Lifestyle: "✨",
  Professional: "💼",
};

// This route coordinates profile state, overlays, and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const photosQuery = useQuery({
    queryKey: nativeQueryKeys.profile.photos,
    queryFn: fetchProfilePhotos,
  });
  const interestsQuery = useQuery({
    queryKey: nativeQueryKeys.profile.interests,
    queryFn: fetchProfileInterests,
  });
  const tagsQuery = useQuery({
    queryKey: nativeQueryKeys.catalog.interests,
    queryFn: fetchInterestTags,
    staleTime: 60 * 60_000,
  });
  const profile = profileQuery.data ?? null;
  const photos = useMemo(() => photosQuery.data ?? [], [photosQuery.data]);
  const interests = useMemo(() => interestsQuery.data ?? [], [interestsQuery.data]);
  const allTags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const summaryQuery = useQuery({
    queryKey: nativeQueryKeys.profile.public(profile?.id ?? ""),
    queryFn: () => fetchPublicProfile(profile!.id),
    enabled: Boolean(profile?.id),
  });
  const stats = {
    friends_count: summaryQuery.data?.stats.friends_count ?? 0,
    photos_count: photos.length,
  };
  const [bio, setBio] = useState("");
  const [displayNameText, setDisplayNameText] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [photoActionId, setPhotoActionId] = useState<string | null>(null);
  const [photoMutationId, setPhotoMutationId] = useState<string | null>(null);
  const [editingInterests, setEditingInterests] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => new Set(interests.map((item) => item.tag_id)));
  const [savingInterests, setSavingInterests] = useState(false);
  const [profileUpdateCoordinator] = useState(createOwnerProfileUpdateCoordinator);

  const name = displayName(profile);
  const premium = isPremium(profile);
  const joined = joinedYear(profile?.created_at);

  const sortedPhotos = useMemo(
    () => [...photos].sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at)),
    [photos]
  );
  const selectedPhoto = sortedPhotos.find((photo) => photo.id === photoActionId) ?? null;
  const visibleTagIds = editingInterests
    ? selectedTagIds
    : new Set(interests.map((item) => item.tag_id));
  const editingCurrentName = editingName && editingOwnerId === profile?.id;
  const editingCurrentBio = editingBio && editingOwnerId === profile?.id;

  useEffect(() => {
    profileUpdateCoordinator.cancel();
    return () => profileUpdateCoordinator.cancel();
  }, [profile?.id, profileUpdateCoordinator]);

  async function saveProfileChanges(updates: { display_name?: string; bio?: string }) {
    if (!profile) return false;
    const ownerId = profile.id;
    const attempt = profileUpdateCoordinator.begin(ownerId);
    setSaving(true);
    setProfileSaveError(null);
    try {
      const updatedProfile = await updateProfile(updates, attempt.signal);
      const currentOwnerId = queryClient.getQueryData<{ id: string }>(nativeQueryKeys.profile.current)?.id ?? "";
      if (!profileUpdateCoordinator.isCurrent(attempt, currentOwnerId)) return false;
      if (!commitNativeOwnerProfileUpdate(queryClient, ownerId, updatedProfile)) {
        profileUpdateCoordinator.finish(attempt, currentOwnerId);
        setSaving(false);
        setProfileSaveError("The server returned a profile for a different account. Try again.");
        return false;
      }
      try {
        await refreshNativeOwnerProfileReferences(queryClient, ownerId, attempt.signal);
      } catch (refreshError) {
        console.warn("Profile reference refresh failed", refreshError);
      }
      const refreshedOwnerId = queryClient.getQueryData<{ id: string }>(nativeQueryKeys.profile.current)?.id ?? "";
      if (!profileUpdateCoordinator.isCurrent(attempt, refreshedOwnerId)) return false;
      profileUpdateCoordinator.finish(attempt, refreshedOwnerId);
      setSaving(false);
      return true;
    } catch (error) {
      const currentOwnerId = queryClient.getQueryData<{ id: string }>(nativeQueryKeys.profile.current)?.id ?? "";
      if (!profileUpdateCoordinator.isCurrent(attempt, currentOwnerId)) return false;
      profileUpdateCoordinator.finish(attempt, currentOwnerId);
      setSaving(false);
      const message = error instanceof Error ? error.message : "Your profile could not be saved. Try again.";
      setProfileSaveError(message);
      return false;
    }
  }

  async function saveBio() {
    if (await saveProfileChanges({ bio })) setEditingBio(false);
  }

  function beginBioEdit() {
    profileUpdateCoordinator.cancel();
    setBio(profile?.bio ?? "");
    setSaving(false);
    setProfileSaveError(null);
    setEditingName(false);
    setEditingOwnerId(profile?.id ?? null);
    setEditingBio(true);
  }

  function beginNameEdit() {
    profileUpdateCoordinator.cancel();
    setDisplayNameText(profile?.display_name ?? profile?.username ?? "");
    setSaving(false);
    setProfileSaveError(null);
    setEditingBio(false);
    setEditingOwnerId(profile?.id ?? null);
    setEditingName(true);
  }

  function cancelProfileEdit() {
    profileUpdateCoordinator.cancel();
    setDisplayNameText(profile?.display_name ?? profile?.username ?? "");
    setBio(profile?.bio ?? "");
    setSaving(false);
    setProfileSaveError(null);
    setEditingName(false);
    setEditingBio(false);
    setEditingOwnerId(null);
  }

  async function uploadPhoto() {
    if (photos.length >= MAX_PROFILE_PHOTOS) {
      Alert.alert("Photo limit reached", `You can upload up to ${MAX_PROFILE_PHOTOS} photos.`);
      return;
    }

    setUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const body = new FormData();
      body.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "profile.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as never);

      const photo = await uploadProfilePhoto(body);
      queryClient.setQueryData(nativeQueryKeys.profile.photos, [...photos, photo]);
      if (profile) {
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(profile.id) });
      }
    } catch (error) {
      Alert.alert("Upload failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadCover() {
    if (uploadingCover) return;
    setUploadingCover(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const body = new FormData();
      body.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "cover.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as never);
      const pendingCover = await uploadProfileCover(body);
      queryClient.setQueryData(nativeQueryKeys.profile.photos, [...photos, pendingCover]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.photos }),
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.current }),
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(profile!.id) }),
      ]);
      Alert.alert("Submitted for review", "Your current cover stays visible until the new cover is approved.");
    } catch (error) {
      Alert.alert("Cover upload failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function setAvatar(photo: OwnerProfilePhoto) {
    setPhotoMutationId(photo.id);
    try {
      const changedPhoto = await updateProfilePhoto(photo.id, { is_avatar: true });
      queryClient.setQueryData(
        nativeQueryKeys.profile.photos,
        photos.map((item) => ({ ...item, is_avatar: item.id === photo.id }))
      );
      if (profile) {
        queryClient.setQueryData(nativeQueryKeys.profile.current, {
          ...profile,
          avatar_url: changedPhoto.url,
        });
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(profile.id) });
      }
    } catch (error) {
      Alert.alert("Avatar failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setPhotoMutationId(null);
    }
  }

  async function togglePrivate(photo: OwnerProfilePhoto) {
    setPhotoMutationId(photo.id);
    try {
      const changedPhoto = await updateProfilePhoto(photo.id, {
        is_private: !photo.is_private,
      });
      queryClient.setQueryData(
        nativeQueryKeys.profile.photos,
        mergePhoto(photos, changedPhoto)
      );
      if (profile) {
        if (photo.is_avatar || photo.is_cover) {
          queryClient.setQueryData(nativeQueryKeys.profile.current, {
            ...profile,
            avatar_url: photo.is_avatar ? null : profile.avatar_url,
            cover_image_url: photo.is_cover ? null : profile.cover_image_url,
          });
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.current }),
          queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(profile.id) }),
        ]);
      }
    } catch (error) {
      Alert.alert("Photo update failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setPhotoMutationId(null);
    }
  }

  async function deletePhoto(photo: OwnerProfilePhoto) {
    setPhotoMutationId(photo.id);
    try {
      await deleteProfilePhoto(photo.id);
      queryClient.setQueryData(
        nativeQueryKeys.profile.photos,
        removePhoto(photos, photo.id)
      );
      if ((photo.is_avatar || photo.is_cover) && profile) {
        queryClient.setQueryData(nativeQueryKeys.profile.current, {
          ...profile,
          avatar_url: photo.is_avatar ? null : profile.avatar_url,
          cover_image_url: photo.is_cover ? null : profile.cover_image_url,
        });
      }
      if (profile) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.current }),
          queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(profile.id) }),
        ]);
      }
    } catch (error) {
      Alert.alert("Delete failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setPhotoMutationId(null);
    }
  }

  function beginInterestEdit() {
    setSelectedTagIds(new Set(interests.map((item) => item.tag_id)));
    setEditingInterests(true);
  }

  function toggleInterest(tagId: string) {
    setSelectedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) next.delete(tagId);
      else if (next.size < 5) next.add(tagId);
      return next;
    });
  }

  async function saveInterests() {
    if (savingInterests) return;
    setSavingInterests(true);
    const serverIds = new Set(interests.map((item) => item.tag_id));
    const toAdd = [...selectedTagIds].filter((tagId) => !serverIds.has(tagId));
    const toRemove = interests.filter((item) => !selectedTagIds.has(item.tag_id));

    try {
      const [added] = await Promise.all([
        Promise.all(
          toAdd.map((tagId) => addProfileInterest(tagId))
        ),
        Promise.all(toRemove.map((item) => deleteProfileInterest(item.id))),
      ]);
      const nextInterests = toRemove.reduce(
        (current, item) => removeInterest(current, item.id),
        interests
      );
      queryClient.setQueryData(
        nativeQueryKeys.profile.interests,
        [...nextInterests, ...added]
      );
      if (profile) {
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(profile.id) });
      }
      setEditingInterests(false);
    } catch (error) {
      setSelectedTagIds(new Set(interests.map((item) => item.tag_id)));
      Alert.alert("Interests not saved", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSavingInterests(false);
    }
  }

  async function signOut() {
    setSettingsOpen(false);
    const pushAuth = captureCurrentPushAuth();
    await unregisterForPushNotifications(pushAuth);
    await supabase.auth.signOut();
    queryClient.clear();
  }

  if (
    profileQuery.isPending ||
    photosQuery.isPending ||
    interestsQuery.isPending ||
    tagsQuery.isPending ||
    (Boolean(profile) && summaryQuery.isPending)
  ) {
    return (
      <Screen>
        <Card>
          <Title>Profile</Title>
          <Muted>Profile data is loading.</Muted>
          <ActivityIndicator color={colors.primary[500]} size="small" />
        </Card>
      </Screen>
    );
  }

  if (
    profileQuery.isError ||
    photosQuery.isError ||
    interestsQuery.isError ||
    tagsQuery.isError ||
    summaryQuery.isError ||
    !profile
  ) {
    return (
      <Screen>
        <Card>
          <Title>Profile unavailable</Title>
          <Muted>We couldn&apos;t load your profile. Check your connection and try again.</Muted>
          <Button
            onPress={() => {
              void profileQuery.refetch();
              void photosQuery.refetch();
              void interestsQuery.refetch();
              void tagsQuery.refetch();
              void summaryQuery.refetch();
            }}
          >
            Try again
          </Button>
        </Card>
      </Screen>
    );
  }

  return (
    <>
    <Screen scroll padded={false}>
      <View style={styles.cover}>
        {profile.cover_image_url ? (
          <Image resizeMode="cover" source={{ uri: profile.cover_image_url }} style={StyleSheet.absoluteFill} />
        ) : (
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={["#2d1f76", "#5346be", "#685be4"]}
            end={{ x: 1, y: 1 }}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        )}
        <View style={styles.coverActionSurface}>
          <IconButton
            icon="camera"
            label="Change cover photo"
            disabled={uploadingCover}
            size={36}
            style={styles.coverAction}
            variant="ghost"
            onPress={() => void uploadCover()}
          />
          <IconButton
            icon="settings"
            label="Settings"
            size={36}
            style={styles.coverAction}
            variant="ghost"
            onPress={() => setSettingsOpen(true)}
          />
        </View>
      </View>

      <View style={styles.identity}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarRing}>
            <Avatar name={name} uri={profile.avatar_url} size={96} />
          </View>
          <View style={styles.avatarSpacer} />
          <IconButton icon="edit" label="Edit profile" size={36} onPress={beginNameEdit} />
        </View>

        <View style={styles.nameRow}>
          <Title numberOfLines={1} style={styles.name}>
            {name}
          </Title>
          {premium ? <PremiumBadge showText /> : null}
        </View>

        <View style={styles.metaRow}>
          <Caption>@{profile.username}</Caption>
          {profile.location_text ? (
            <>
              <Caption>·</Caption>
              <Caption>{profile.location_text}</Caption>
            </>
          ) : null}
          {joined ? (
            <>
              <Caption>·</Caption>
              <Caption>{joined}</Caption>
            </>
          ) : null}
        </View>
        {editingCurrentName ? (
          <OwnerDisplayNameEditor
            error={profileSaveError}
            onCancel={cancelProfileEdit}
            onChange={setDisplayNameText}
            onSave={() => {
              void saveProfileChanges({ display_name: displayNameText }).then((saved) => {
                if (saved) setEditingName(false);
              });
            }}
            saving={saving}
            value={displayNameText}
          />
        ) : null}
      </View>

      <View style={styles.statRow}>
        <StatCard value={stats.friends_count} label="Friends" />
        <StatCard value={stats.photos_count} label="Photos" />
      </View>

      <View style={styles.shareWrap}>
        <Button fullWidth leftIcon="share" onPress={() => setShareOpen(true)}>
          Share profile
        </Button>
      </View>

      <View style={styles.sections}>
        <Card>
          <View style={styles.cardHeader}>
            <SectionTitle>About</SectionTitle>
            {!editingCurrentBio ? <IconButton icon="edit" label="Edit bio" size={36} onPress={beginBioEdit} /> : null}
          </View>
          {editingCurrentBio ? (
            <View style={styles.editBlock}>
              <TextInputBio value={bio} onChangeText={setBio} />
              <View style={styles.bioActions}>
                <Caption>{bio.length}/{MAX_BIO_LENGTH}</Caption>
                <View style={styles.actionRow}>
                  <Button disabled={saving} size="sm" variant="secondary" onPress={cancelProfileEdit}>
                    Cancel
                  </Button>
                  <Button size="sm" loading={saving} onPress={saveBio}>
                    Save
                  </Button>
                </View>
              </View>
              {profileSaveError ? (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>{profileSaveError}</Text>
              ) : null}
            </View>
          ) : (
            <Body style={profile.bio ? undefined : styles.emptyText}>
              {profile.bio || "Tap the pencil to add bio!"}
            </Body>
          )}
        </Card>

        <Card>
          <View style={styles.cardHeader}>
            <SectionTitle>Interests</SectionTitle>
            {editingInterests ? (
              <Pressable accessibilityRole="button" disabled={savingInterests} onPress={saveInterests} style={styles.doneButton}>
                {savingInterests ? <ActivityIndicator color={colors.surface} size={13} /> : null}
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            ) : (
              <IconButton icon="edit" label="Edit interests" size={36} onPress={beginInterestEdit} />
            )}
          </View>
          <View style={styles.chips}>
            {[...visibleTagIds].length === 0 ? (
              <Muted style={styles.interestEmpty}>Add interests to help others connect with you</Muted>
            ) : (
              [...visibleTagIds].map((tagId) => {
                const tag = allTags.find((item) => item.id === tagId) ?? interests.find((item) => item.tag_id === tagId)?.tag;
                if (!tag) return null;
                const index = Math.max(0, allTags.findIndex((item) => item.id === tagId));
                const palette = interestColors[index % interestColors.length];
                return (
                  <Pressable
                    disabled={!editingInterests}
                    key={tagId}
                    onPress={() => toggleInterest(tagId)}
                    style={[styles.chip, { backgroundColor: palette.bg, borderColor: `${palette.text}30` }]}
                  >
                    <Text style={[styles.chipText, { color: palette.text }]}>{tag.name}</Text>
                    {editingInterests ? <X color={palette.text} size={12} strokeWidth={2} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>
          {editingInterests ? (
            <View style={styles.interestPicker}>
              {Object.entries(
                allTags.reduce<Record<string, typeof allTags>>((groups, tag) => {
                  if (selectedTagIds.has(tag.id)) return groups;
                  (groups[tag.category] ??= []).push(tag);
                  return groups;
                }, {})
              ).map(([category, tags]) => (
                <View key={category} style={styles.interestGroup}>
                  <Caption style={styles.categoryLabel}>{categoryEmoji[category] ?? "•"} {category}</Caption>
                  <View style={styles.chips}>
                    {tags.map((tag) => (
                      <Pressable
                        disabled={selectedTagIds.size >= 5}
                        key={tag.id}
                        onPress={() => toggleInterest(tag.id)}
                        style={({ pressed }) => [styles.availableChip, selectedTagIds.size >= 5 && styles.disabledChip, pressed && styles.pressed]}
                      >
                        <Text style={styles.availableChipText}>{tag.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              {selectedTagIds.size >= 5 ? <Caption>Maximum of 5 interests selected</Caption> : null}
            </View>
          ) : null}
        </Card>

        <PremiumPanel active={premium} />

        <Card>
          <View style={styles.cardHeader}>
            <SectionTitle>Photos ({photos.length}/{MAX_PROFILE_PHOTOS})</SectionTitle>
          </View>
          {photos.length === 0 ? (
            <Pressable style={styles.photoEmpty} onPress={uploadPhoto}>
              <IconGlyph name="image" color={colors.ink[5]} size={32} />
              <Muted>Add photos</Muted>
            </Pressable>
          ) : (
            <View style={styles.photoGrid}>
              {sortedPhotos.map((photo, index) => (
                <PhotoTile
                  key={photo.id}
                  loading={photoMutationId === photo.id}
                  photo={photo}
                  onMenu={() => setPhotoActionId(photo.id)}
                  onPress={() => setViewerIndex(index)}
                />
              ))}
              {photos.length < MAX_PROFILE_PHOTOS ? (
                <Pressable style={styles.addPhotoTile} onPress={uploadPhoto} disabled={uploading}>
                  {uploading ? (
                    <Muted>...</Muted>
                  ) : (
                    <>
                      <IconGlyph name="camera" color={colors.primary[500]} size={24} />
                      <Caption style={{ color: colors.primary[500] }}>Add Photo</Caption>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>
          )}
        </Card>
      </View>
    </Screen>
      <SettingsSheet
        onClose={() => setSettingsOpen(false)}
        onDeleteAccount={() => deleteCurrentAccount(queryClient)}
        onSignOut={signOut}
        open={settingsOpen}
      />
      <ShareSheet onClose={() => setShareOpen(false)} open={shareOpen} />
      <PhotoActionsDialog
        photo={selectedPhoto}
        onClose={() => setPhotoActionId(null)}
        onDelete={deletePhoto}
        onSetAvatar={setAvatar}
        onTogglePrivate={togglePrivate}
      />
      <PhotoViewer
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onIndexChange={setViewerIndex}
        photos={sortedPhotos}
      />
    </>
  );
}

function TextInputBio({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={(next) => onChangeText(next.slice(0, MAX_BIO_LENGTH))}
      multiline
      maxLength={MAX_BIO_LENGTH}
      placeholder="Write something about yourself..."
      placeholderTextColor={colors.ink[5]}
      style={styles.bioInput}
      textAlignVertical="top"
    />
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Caption>{label}</Caption>
    </Card>
  );
}

function PremiumPanel({ active }: { active: boolean }) {
  return (
    <View style={[styles.peekPlusPanel, active && styles.peekPlusPanelActive]}>
      <IconGlyph name="premium" color={colors.primary[500]} size={20} />
      <View style={styles.peekPlusContent}>
        <BodyBold style={styles.peekPlusTitle}>Peek+</BodyBold>
        <Caption style={styles.peekPlusCopy}>{active ? "Active subscription" : "Pokes, messages, plans, and meeting up stay free."}</Caption>
      </View>
      <Pressable
        accessibilityLabel={active ? "Manage Peek+ billing" : "Open Peek+ preview"}
        accessibilityRole="button"
        onPress={() => router.navigate("/(app)/premium" as never)}
        style={({ pressed }) => [styles.peekPlusAction, pressed && styles.pressed]}
      >
        <IconGlyph name={active ? "settings" : "arrow-right"} color={colors.primary[600]} size={16} />
        <Caption style={styles.peekPlusActionText}>{active ? "Manage billing" : "Preview"}</Caption>
      </Pressable>
    </View>
  );
}

function PhotoTile({
  loading,
  photo,
  onPress,
  onMenu,
}: {
  loading: boolean;
  photo: OwnerProfilePhoto;
  onPress: () => void;
  onMenu: () => void;
}) {
  return (
    <View style={styles.photoTile}>
      <Pressable accessibilityLabel="View photo" disabled={loading || !photo.url} onPress={onPress} style={StyleSheet.absoluteFill}>
        {photo.url ? (
          <Image source={{ uri: photo.thumbnail_url || photo.url }} style={[styles.photoImage, loading && styles.photoImageLoading]} />
        ) : (
          <View style={[styles.photoImage, styles.removedPhoto]}>
            <Caption>Media removed</Caption>
          </View>
        )}
      </Pressable>
      {photo.approval_status === "rejected" ? (
        <View style={styles.rejectedOverlay}>
          <IconGlyph name="close" color={colors.danger[500]} size={42} />
        </View>
      ) : null}
      {photo.is_avatar ? (
        <View style={styles.photoBadgeLeft}>
          <IconGlyph name="premium" color={colors.surface} size={11} />
        </View>
      ) : null}
      {photo.is_private ? (
        <View style={styles.photoBadgeRight}>
          <IconGlyph name="lock" color={colors.surface} size={10} />
        </View>
      ) : null}
      {photo.approval_status === "pending" ? (
        <View style={styles.pendingBadge}>
          <Caption style={styles.statusBadgeText}>Pending</Caption>
        </View>
      ) : null}
      {photo.approval_status === "rejected" ? (
        <View style={styles.rejectedBadge}>
          <Caption style={styles.statusBadgeText}>Rejected</Caption>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.photoLoading}>
          <ActivityIndicator color={colors.surface} size="small" />
        </View>
      ) : (
        <Pressable accessibilityLabel="Manage photo" onPress={onMenu} style={[styles.photoMenu, photo.is_private && styles.photoMenuPrivate]}>
          <MoreVertical color={colors.surface} size={16} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: 190,
    overflow: "hidden",
  },
  coverActionSurface: {
    position: "absolute",
    top: spacing[3],
    right: spacing[3],
    width: 96,
    height: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: "hidden",
    backgroundColor: colors.surface,
    flexDirection: "row",
  },
  coverAction: {
    borderRadius: radii.md,
  },
  identity: {
    paddingHorizontal: spacing[6],
    marginTop: -48,
    gap: spacing[2],
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    padding: 4,
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  avatarSpacer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[1],
  },
  name: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  errorText: {
    color: colors.danger[500],
    ...typography.caption,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing[3],
    paddingHorizontal: spacing[6],
    marginTop: spacing[4],
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    gap: 2,
  },
  statValue: {
    ...typography.title2,
    color: colors.ink[9],
    fontVariant: ["tabular-nums"],
  },
  shareWrap: {
    paddingHorizontal: spacing[6],
    marginTop: spacing[3],
  },
  sections: {
    padding: spacing[6],
    paddingTop: spacing[4],
    gap: spacing[4],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  doneButton: {
    minHeight: 30,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.ink[9],
    ...shadows.e1,
  },
  doneText: {
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.surface,
  },
  editBlock: {
    gap: spacing[2],
  },
  bioInput: {
    minHeight: 96,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.ink[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    color: colors.ink[8],
    ...typography.body,
  },
  bioActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  emptyText: {
    color: colors.ink[5],
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  chipText: {
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  interestEmpty: {
    fontStyle: "italic",
  },
  interestPicker: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    marginTop: spacing[3],
    paddingTop: spacing[3],
    gap: spacing[4],
  },
  interestGroup: {
    gap: spacing[2],
  },
  categoryLabel: {
    fontFamily: fontFamilies.semibold,
  },
  availableChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 7,
    backgroundColor: colors.background,
    ...shadows.e1,
  },
  availableChipText: {
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink[9],
  },
  disabledChip: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.72,
  },
  peekPlusPanel: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary[200],
    backgroundColor: colors.ink[1],
    padding: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  peekPlusPanelActive: {
    backgroundColor: colors.primary[50],
  },
  peekPlusContent: {
    flex: 1,
    gap: 2,
  },
  peekPlusTitle: {
    color: colors.ink[9],
  },
  peekPlusCopy: {
    color: colors.ink[6],
  },
  peekPlusAction: {
    minHeight: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary[100],
  },
  peekPlusActionText: {
    color: colors.primary[700],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  photoEmpty: {
    minHeight: 150,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.ink[3],
    backgroundColor: colors.ink[1],
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  photoTile: {
    width: "32%",
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.ink[2],
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoImageLoading: {
    opacity: 0.5,
  },
  removedPhoto: {
    alignItems: "center",
    justifyContent: "center",
  },
  photoLoading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  addPhotoTile: {
    width: "32%",
    aspectRatio: 1,
    borderRadius: radii.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
  },
  photoBadgeLeft: {
    position: "absolute",
    left: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  photoBadgeRight: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  photoMenu: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  photoMenuPrivate: {
    right: 30,
  },
  pendingBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.warn[500],
  },
  rejectedBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.danger[500],
  },
  statusBadgeText: {
    color: colors.surface,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "700",
  },
  rejectedOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
});
