import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Ban from "lucide-react-native/icons/ban";
import Flag from "lucide-react-native/icons/flag";
import Lock from "lucide-react-native/icons/lock";
import X from "lucide-react-native/icons/x";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { InterestTag, PublicProfilePhoto } from "@peekpoke/shared";
import { ApiTransportError, isPremium } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import { Avatar, PremiumBadge } from "@/components/ui";
import { fetchCurrentProfile } from "@/data/profile/api";
import { publicProfileQueryOptions } from "@/data/discovery/queries";
import { nativeQueryKeys } from "@/data/query-keys";
import { apiFetch, jsonBody } from "@/lib/api";
import {
  blockUser,
  discardBlockUser,
  pendingBlockUser,
} from "@/data/social/api";

const interestColors = [
  { bg: "#EDE9FF", text: "#6C63FF" },
  { bg: "#E6F9F0", text: "#38A169" },
  { bg: "#FEF3E2", text: "#C05621" },
  { bg: "#FEE8E8", text: "#C53030" },
  { bg: "#E8F4FD", text: "#2B6CB0" },
  { bg: "#E6FFFA", text: "#2C7A7B" },
] as const;

// This route coordinates profile queries, actions, and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const viewerQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const viewer = viewerQuery.data ?? null;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<string | null>(null);
  const blockTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (viewer?.id && viewer.id === userId) router.replace("/(app)/profile" as never);
  }, [userId, viewer?.id]);

  useEffect(() => {
    blockTargetRef.current = userId ?? null;
    return () => {
      if (blockTargetRef.current === userId) blockTargetRef.current = null;
    };
  }, [userId]);

  const query = useQuery({
    ...publicProfileQueryOptions(userId ?? ""),
    enabled: Boolean(userId) && !viewerQuery.isPending && viewer?.id !== userId,
    retry: false,
  });

  const data = query.data;
  const profile = data?.profile ?? null;
  const name = profile?.display_name || profile?.username || "User";
  const targetIsPremium = profile?.is_premium ?? false;
  const viewerIsPremium = isPremium(viewer);
  const hasPendingBlockRecovery = Boolean(userId && pendingBlockUser(userId));

  const approvedPhotos = useMemo(() => data?.photos ?? [], [data?.photos]);
  const visiblePhotos = useMemo(
    () => approvedPhotos.filter(
      (photo): photo is PublicProfilePhoto & { url: string } =>
        photo.access === "viewable" && photo.url !== null,
    ),
    [approvedPhotos]
  );
  const privatePhotoCount = approvedPhotos.filter((photo) => photo.is_private).length;
  const tileSize = Math.max(76, (width - 80 - 8) / 3);

  function openPhoto(photo: PublicProfilePhoto) {
    if (photo.access !== "viewable" || photo.url === null) return;
    const index = visiblePhotos.findIndex((item) => item.id === photo.id);
    if (index >= 0) setViewerIndex(index);
  }

  async function reportUser(category: string) {
    if (!userId || safetyLoading) return;
    setSafetyLoading(true);
    setSafetyStatus(null);
    try {
      await apiFetch(`/api/users/${userId}/report`, {
        method: "POST",
        body: jsonBody({ category }),
      });
      setSafetyStatus("Report received. Thank you for helping keep the community safe.");
    } catch {
      setSafetyStatus("The report could not be sent. Please try again.");
    } finally {
      setSafetyLoading(false);
    }
  }

  function chooseReportReason() {
    Alert.alert("Report profile", "Choose a category.", [
      {
        text: "Content or identity",
        onPress: () => Alert.alert("Report profile", "Choose the reason.", [
          { text: "Inappropriate content", onPress: () => void reportUser("explicit_content") },
          { text: "Impersonation", onPress: () => void reportUser("impersonation") },
          { text: "Cancel", style: "cancel" },
        ]),
      },
      {
        text: "Behavior or age",
        onPress: () => Alert.alert("Report profile", "Choose the reason.", [
          { text: "Harassment or threats", onPress: () => void reportUser("harassment") },
          { text: "May be underage", onPress: () => void reportUser("underage") },
          { text: "Cancel", style: "cancel" },
        ]),
      },
      {
        text: "Spam or other",
        onPress: () => Alert.alert("Report profile", "Choose the reason.", [
          { text: "Spam or scam", onPress: () => void reportUser("spam") },
          { text: "Other safety concern", onPress: () => void reportUser("other") },
          { text: "Cancel", style: "cancel" },
        ]),
      },
    ]);
  }

  function discardBlockRecovery() {
    if (!userId || !discardBlockUser(userId)) return;
    setSafetyStatus("Pending block request discarded. Current data is being refreshed.");
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(userId) }),
    ]);
  }

  function showBlockRecovery() {
    Alert.alert(
      "Block result unknown",
      "Retry safely with the same request, or discard it and refresh current data.",
      [
        { text: "Keep for later", style: "cancel" },
        { text: "Discard & refresh", onPress: discardBlockRecovery },
        { text: "Retry safely", onPress: () => void runBlock() },
      ],
    );
  }

  async function runBlock() {
    if (!userId || safetyLoading) return;
    setSafetyLoading(true);
    setSafetyStatus(null);
    try {
      await blockUser(userId, (response) => {
        if (blockTargetRef.current !== userId) return;
        if (response.balance !== null) {
          queryClient.setQueryData(nativeQueryKeys.coins, { balance: response.balance });
        }
        queryClient.removeQueries({ queryKey: nativeQueryKeys.profile.public(userId) });
        router.replace("/(app)/rooms" as never);
      });
    } catch (error) {
      if (blockTargetRef.current !== userId) return;
      if (pendingBlockUser(userId)) {
        setSafetyStatus("The block result is unknown. Retry safely or discard and refresh.");
        showBlockRecovery();
      } else {
        setSafetyStatus(error instanceof ApiTransportError && error.status === 429
          ? "Too many block requests. Wait and try again."
          : "This person could not be blocked. Please try again.");
      }
    } finally {
      // react-doctor-disable-next-line no-loading-flag-reset-outside-finally -- guarded reset is inside finally
      if (blockTargetRef.current === userId) setSafetyLoading(false);
    }
  }

  function confirmBlock() {
    Alert.alert("Block this person?", "You will no longer be able to interact.", [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: () => void runBlock() },
    ]);
  }

  if (viewerQuery.isPending || query.isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primary[500]} size="large" />
      </View>
    );
  }

  if (viewerQuery.isError || query.isError || !data || !profile) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.notFoundTitle}>Profile unavailable</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void viewerQuery.refetch();
            void query.refetch();
          }}
          style={styles.darkPill}
        >
          <Text style={styles.darkPillText}>Try again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.darkPill}>
          <Text style={styles.darkPillText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const header = (
    <View style={[styles.header, !profile.avatar_url && styles.headerSolid, { paddingTop: insets.top + spacing[3] }]}>
      {profile.avatar_url ? <View style={styles.headerOverlay} /> : null}
      <View style={styles.headerContent}>
        <View style={styles.backRow}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ChevronLeft accessible={false} color={colors.ink[5]} size={18} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.avatarStatsWrap}>
          <View style={styles.avatarShell}>
            <Avatar name={name} uri={profile.avatar_url} size={80} />
          </View>
          <View style={styles.statsPill}>
            <Text style={styles.statStrong}>{data.stats.photos_count}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          {targetIsPremium ? <PremiumBadge showText /> : null}
        </View>
        <Text style={styles.handle}>@{profile.username}</Text>
        {profile.bio ? <Text style={styles.headerBio}>{profile.bio}</Text> : null}


      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 112 }]}
      >
        {profile.cover_image_url || profile.avatar_url ? (
          <View style={styles.imageHeader}>
            <Image
              source={{ uri: profile.cover_image_url || profile.avatar_url || undefined }}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
            {header}
          </View>
        ) : header}

        <View style={styles.sections}>
          {profile.bio ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>About</Text>
              <Text style={styles.cardBody}>{profile.bio}</Text>
            </View>
          ) : null}

          {data.interests.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Interests</Text>
              <View style={styles.interests}>
                {data.interests.map((interest, index) => {
                  const tag = interest.tag as InterestTag | undefined;
                  if (!tag) return null;
                  const palette = interestColors[index % interestColors.length];
                  return (
                    <View
                      key={interest.id}
                      style={[styles.interestChip, { backgroundColor: palette.bg, borderColor: `${palette.text}30` }]}
                    >
                      <Text style={[styles.interestText, { color: palette.text }]}>{tag.name}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {approvedPhotos.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.photoHeader}>
                <Text style={styles.photoTitle}>PHOTOS ({approvedPhotos.length})</Text>
                {!viewerIsPremium && privatePhotoCount > 0 ? (
                  <View style={styles.privateCount}>
                    <Lock accessible={false} color={colors.ink[5]} size={12} strokeWidth={2} />
                    <Text style={styles.privateCountText}>{privatePhotoCount} private</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.photoGrid}>
                {approvedPhotos.map((photo) => {
                  const canView = photo.access === "viewable" && photo.url !== null;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={photo.id}
                      disabled={!canView}
                      onPress={() => openPhoto(photo)}
                      style={[styles.photoTile, { width: tileSize, height: tileSize }]}
                    >
                      {canView && photo.url !== null ? (
                        <Image
                          source={{ uri: photo.thumbnail_url ?? photo.url }}
                          style={styles.photo}
                        />
                      ) : (
                        <View style={[styles.photo, styles.lockedPhoto]} />
                      )}
                      {!canView ? (
                        <View style={styles.lockedOverlay}>
                          <View style={styles.lockCircle}>
                            <Lock accessible={false} color={colors.surface} size={18} strokeWidth={2} />
                          </View>
                        </View>
                      ) : photo.is_private ? (
                        <View style={styles.privateBadge}>
                          <Lock accessible={false} color={colors.surface} size={12} strokeWidth={2} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Safety</Text>
            <View style={styles.safetyActions}>
              <Pressable
                accessibilityRole="button"
                disabled={safetyLoading}
                onPress={chooseReportReason}
                style={({ pressed }) => [styles.reportAction, safetyLoading && styles.disabledAction, pressed && styles.pressed]}
              >
                <Flag color="#92400e" size={16} strokeWidth={2} />
                <Text style={styles.reportActionText}>Report</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={safetyLoading}
                onPress={confirmBlock}
                style={({ pressed }) => [styles.blockAction, safetyLoading && styles.disabledAction, pressed && styles.pressed]}
              >
                <Ban color={colors.danger[500]} size={16} strokeWidth={2} />
                <Text style={styles.blockActionText}>Block</Text>
              </Pressable>
            </View>
            {safetyStatus ? <Text accessibilityRole="alert" style={styles.safetyStatus}>{safetyStatus}</Text> : null}
            {hasPendingBlockRecovery ? (
              <Pressable
                accessibilityRole="button"
                disabled={safetyLoading}
                onPress={showBlockRecovery}
                style={({ pressed }) => [
                  styles.surfaceAction,
                  safetyLoading && styles.disabledAction,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.requestedText}>Recover pending block</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <PhotoViewer photos={visiblePhotos} index={viewerIndex} onIndexChange={setViewerIndex} />
    </View>
  );
}

function PhotoViewer({
  photos,
  index,
  onIndexChange,
}: {
  photos: (PublicProfilePhoto & { url: string })[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const photo = index === null ? null : photos[index];
  return (
    <Modal animationType="fade" transparent visible={!!photo} onRequestClose={() => onIndexChange(null)}>
      <StatusBar animated style="light" />
      <View style={styles.viewerBackdrop}>
        <Pressable accessibilityLabel="Close photo" onPress={() => onIndexChange(null)} style={styles.viewerClose}>
          <X accessible={false} color={colors.surface} size={24} strokeWidth={2} />
        </Pressable>
        {photo ? <Image resizeMode="contain" source={{ uri: photo.url }} style={styles.viewerImage} /> : null}
        {index !== null && index > 0 ? (
          <Pressable accessibilityLabel="Previous photo" onPress={() => onIndexChange(index - 1)} style={[styles.viewerArrow, styles.viewerLeft]}>
            <ChevronLeft accessible={false} color={colors.surface} size={24} strokeWidth={2} />
          </Pressable>
        ) : null}
        {index !== null && index < photos.length - 1 ? (
          <Pressable accessibilityLabel="Next photo" onPress={() => onIndexChange(index + 1)} style={[styles.viewerArrow, styles.viewerRight]}>
            <ChevronRight accessible={false} color={colors.surface} size={24} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingScreen: {
    flex: 1,
    paddingHorizontal: spacing[6],
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    backgroundColor: colors.background,
  },
  notFoundTitle: {
    ...typography.title2,
    color: colors.ink[9],
  },
  darkPill: {
    height: 40,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[5],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  darkPillText: {
    ...typography.bodyBold,
    color: colors.surface,
  },
  imageHeader: {
    width: "100%",
    position: "relative",
  },
  header: {
    minHeight: 386,
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[6],
    alignItems: "center",
  },
  headerSolid: {
    backgroundColor: colors.background,
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
  },
  headerContent: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    alignItems: "center",
    gap: spacing[3],
  },
  backRow: {
    width: "100%",
    alignItems: "flex-start",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    ...shadows.e1,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  avatarStatsWrap: {
    position: "relative",
    marginBottom: spacing[5],
  },
  avatarShell: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background,
    ...shadows.e2,
  },
  statsPill: {
    position: "absolute",
    top: 64,
    left: "50%",
    minWidth: 220,
    height: 30,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.background,
    transform: [{ translateX: -110 }],
    ...shadows.e1,
  },
  statStrong: {
    color: colors.primary[500],
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  statLabel: {
    ...typography.caption,
    color: colors.ink[5],
  },
  statDivider: {
    ...typography.caption,
    color: colors.ink[4],
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  name: {
    color: colors.ink[9],
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700",
    textAlign: "center",
  },
  handle: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  headerBio: {
    maxWidth: 320,
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  actionRow: {
    paddingTop: spacing[2],
    flexDirection: "row",
    gap: spacing[3],
  },
  surfaceAction: {
    height: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.background,
    ...shadows.e1,
  },
  sayHiText: {
    color: colors.primary[500],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  wave: {
    fontSize: 16,
    lineHeight: 20,
  },
  requestedText: {
    color: colors.ink[5],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  addFriendAction: {
    height: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.ink[9],
    ...shadows.e1,
  },
  addFriendText: {
    color: colors.surface,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  sections: {
    padding: spacing[6],
    paddingTop: spacing[4],
    gap: spacing[6],
  },
  card: {
    borderRadius: radii.md,
    padding: spacing[4],
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  cardTitle: {
    color: colors.ink[9],
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: spacing[2],
  },
  cardBody: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  safetyActions: {
    flexDirection: "row",
    gap: spacing[3],
  },
  reportAction: {
    flex: 1,
    height: 42,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: "#fffbeb",
  },
  reportActionText: {
    ...typography.body,
    color: "#92400e",
    fontFamily: fontFamilies.semibold,
  },
  blockAction: {
    flex: 1,
    height: 42,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: "#fff1f0",
  },
  blockActionText: {
    ...typography.body,
    color: colors.danger[500],
    fontFamily: fontFamilies.semibold,
  },
  safetyStatus: {
    ...typography.caption,
    color: colors.ink[5],
    marginTop: spacing[3],
  },
  disabledAction: {
    opacity: 0.6,
  },
  interests: {
    minHeight: 28,
    padding: spacing[1],
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  interestChip: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    ...shadows.e1,
  },
  interestText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  photoHeader: {
    marginBottom: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoTitle: {
    color: colors.ink[5],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: 0.4,
  },
  privateCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  privateCountText: {
    ...typography.caption,
    color: colors.ink[5],
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[1],
  },
  photoTile: {
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.ink[2],
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  lockedPhoto: {
    backgroundColor: colors.primary[200],
  },
  lockedOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[3],
  },
  lockCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[8],
  },
  privateBadge: {
    position: "absolute",
    top: spacing[1],
    right: spacing[1],
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  viewerBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  viewerImage: {
    width: "100%",
    height: "82%",
  },
  viewerClose: {
    position: "absolute",
    top: 54,
    right: spacing[4],
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  viewerArrow: {
    position: "absolute",
    top: "50%",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
  },
  viewerLeft: {
    left: spacing[3],
  },
  viewerRight: {
    right: spacing[3],
  },
});
