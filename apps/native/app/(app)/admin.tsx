import Mapbox from "@rnmapbox/maps";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ModerationPhoto } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import {
  Avatar,
  BodyBold,
  Button,
  Caption,
  Card,
  EmptyState,
  IconGlyph,
  IconButton,
  Muted,
  Screen,
  SegmentedControl,
  Skeleton,
  Title,
} from "@/components/ui";
import { displayName } from "@/components/ui-helpers";
import { AdminReportActions } from "@/components/admin-report-actions";
import {
  adminQueryOptions,
  deleteAdminCoin,
  hasAdminRole,
  moderatePhoto,
  placeAdminCoin,
  updateReport as updateAdminReport,
  type AdminCoin,
  type PhotoApprovalStatus,
  type ReportStatus,
} from "@/data/admin/api";
import { fetchBootstrap } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import { env } from "@/lib/env";

Mapbox.setAccessToken(env.mapboxToken);

type Tab = "moderation" | "reports" | "coins";

type PhotoWithUser = ModerationPhoto;

const DEFAULT_CENTER: [number, number] = [23.3219, 42.6977];

export default function AdminScreen() {
  const bootstrap = useQuery({
    queryKey: nativeQueryKeys.bootstrap,
    queryFn: ({ signal }) => fetchBootstrap(signal),
  });
  const [tab, setTab] = useState<Tab>("moderation");

  if (bootstrap.isLoading) {
    return (
      <Screen contentStyle={styles.denied}>
        <ActivityIndicator accessibilityLabel="Loading admin access" color={colors.primary[500]} />
      </Screen>
    );
  }

  if (bootstrap.isError) {
    return (
      <Screen contentStyle={styles.denied}>
        <EmptyState
          icon="alert"
          title="Admin access unavailable"
          description="Check your connection and try again."
          actionLabel="Try Again"
          onAction={() => void bootstrap.refetch()}
        />
      </Screen>
    );
  }

  if (!hasAdminRole(bootstrap.data?.roles)) {
    return (
      <Screen contentStyle={styles.denied}>
        <Muted>Access denied</Muted>
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.header}>
        <Title>Admin Panel</Title>
        <Muted>Manage safety reports, photo moderation, and map coins</Muted>
      </View>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "moderation", label: "Moderation" },
          { value: "reports", label: "Reports" },
          { value: "coins", label: "Coins" },
        ]}
      />

      {tab === "moderation" ? <ModerationTab /> : tab === "reports" ? <ReportsTab /> : <CoinsTab />}
    </Screen>
  );
}

function ModerationTab() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PhotoApprovalStatus>("pending");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<PhotoWithUser | null>(null);
  const [rejectingPhoto, setRejectingPhoto] = useState<PhotoWithUser | null>(null);
  const [reason, setReason] = useState("");

  const query = useQuery(adminQueryOptions.photos(status, cursor));
  const pending = useQuery(adminQueryOptions.photos("pending", null));
  const moderationMutation = useMutation({
    mutationFn: ({
      photoId,
      action,
      rejectionReason,
    }: {
      photoId: string;
      action: "approve" | "reject";
      rejectionReason?: string;
    }) => moderatePhoto(photoId, action, rejectionReason),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "photos"] }),
        queryClient.invalidateQueries({ queryKey: nativeQueryKeys.profile.public(response.photo.user_id) }),
        queryClient.invalidateQueries({ queryKey: ["discovery"] }),
      ]);
    },
  });

  function changeStatus(next: PhotoApprovalStatus) {
    setStatus(next);
    setCursor(null);
    setPreviousCursors([]);
  }

  async function approve(photo: PhotoWithUser) {
    setActingId(photo.id);
    try {
      await moderationMutation.mutateAsync({ photoId: photo.id, action: "approve" });
      setViewerPhoto(null);
    } catch (error) {
      Alert.alert("Moderation failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setActingId(null);
    }
  }

  function beginReject(photo: PhotoWithUser) {
    setViewerPhoto(null);
    setReason("");
    setRejectingPhoto(photo);
  }

  async function reject() {
    if (!rejectingPhoto || !reason.trim()) return;
    setActingId(rejectingPhoto.id);
    try {
      await moderationMutation.mutateAsync({
        photoId: rejectingPhoto.id,
        action: "reject",
        rejectionReason: reason.trim(),
      });
      setRejectingPhoto(null);
      setReason("");
    } catch (error) {
      Alert.alert("Moderation failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setActingId(null);
    }
  }

  const photos = query.data?.items ?? [];
  const pagination = query.data?.page;

  return (
    <View style={styles.section}>
      <SegmentedControl
        value={status}
        onChange={changeStatus}
        options={[
          { value: "pending", label: "Pending", badge: pending.data?.total || undefined },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />

      {query.isLoading ? (
        <PhotoSkeleton />
      ) : query.isError ? (
        <EmptyState
          icon="alert"
          title="Failed to load photos"
          description="Try again later."
          actionLabel="Try Again"
          onAction={() => void query.refetch()}
        />
      ) : photos.length === 0 ? (
        <EmptyState icon="alert" title={`No ${status} photos`} />
      ) : (
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <Pressable
              accessibilityLabel={`Review photo from ${displayName(photo.user)}`}
              disabled={!photo.url}
              key={photo.id}
              onPress={() => setViewerPhoto(photo)}
              style={styles.photoCard}
            >
              {photo.url ? (
                <Image source={{ uri: photo.url }} style={styles.photo} />
              ) : (
                <View style={styles.photo} />
              )}
              <View style={styles.userBadge}>
                <Avatar name={displayName(photo.user)} uri={photo.user?.avatar_url} size={20} />
                <Text numberOfLines={1} style={styles.userBadgeText}>{displayName(photo.user)}</Text>
              </View>
              {status === "pending" ? (
                <View style={styles.moderationActions}>
                  {actingId === photo.id ? (
                    <View style={styles.actionLoader}><ActivityIndicator color={colors.surface} size={18} /></View>
                  ) : (
                    <>
                      <IconButton icon="check" iconColor={colors.surface} iconSize={15} label="Approve photo" onPress={() => approve(photo)} size={36} variant="ghost" visualStyle={styles.approve} />
                      <IconButton icon="close" iconColor={colors.surface} iconSize={15} label="Reject photo" onPress={() => beginReject(photo)} size={36} variant="ghost" visualStyle={styles.reject} />
                    </>
                  )}
                </View>
              ) : null}
              {status === "rejected" && photo.rejection_reason ? (
                <View style={styles.rejectedBadge}><Text style={styles.rejectedBadgeText}>Rejected</Text></View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      {pagination && (previousCursors.length > 0 || pagination.has_more) ? (
        <View style={styles.pagination}>
          <Button
            disabled={previousCursors.length === 0}
            leftIcon="back"
            onPress={() => {
              const previous = previousCursors.at(-1) ?? null;
              setPreviousCursors((values) => values.slice(0, -1));
              setCursor(previous);
            }}
            size="sm"
            variant="secondary"
          >
            Previous
          </Button>
          <Caption>Page {previousCursors.length + 1}</Caption>
          <Button
            disabled={!pagination.has_more || !pagination.next_cursor}
            onPress={() => {
              if (!pagination.next_cursor) return;
              setPreviousCursors((values) => [...values, cursor]);
              setCursor(pagination.next_cursor);
            }}
            rightIcon="arrow-right"
            size="sm"
            variant="secondary"
          >
            Next
          </Button>
        </View>
      ) : null}

      <ModerationViewer
        acting={actingId === viewerPhoto?.id}
        photo={viewerPhoto}
        status={status}
        onApprove={approve}
        onClose={() => setViewerPhoto(null)}
        onReject={beginReject}
      />
      <RejectDialog
        loading={actingId === rejectingPhoto?.id}
        open={!!rejectingPhoto}
        reason={reason}
        onCancel={() => setRejectingPhoto(null)}
        onChangeReason={setReason}
        onReject={reject}
      />
    </View>
  );
}

function ReportsTab() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>("pending");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const query = useQuery(adminQueryOptions.reports(status, cursor));
  const reportMutation = useMutation({
    mutationFn: ({
      reportId,
      nextStatus,
    }: {
      reportId: string;
      nextStatus: "reviewing" | "resolved" | "dismissed";
    }) => updateAdminReport(reportId, nextStatus),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    },
  });

  async function updateReport(reportId: string, nextStatus: "reviewing" | "resolved" | "dismissed") {
    setActingId(reportId);
    try {
      await reportMutation.mutateAsync({ reportId, nextStatus });
    } catch (error) {
      Alert.alert("Report update failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <View style={styles.sectionGap}>
      <SegmentedControl
        value={status}
        onChange={(nextStatus) => {
          setStatus(nextStatus);
          setCursor(null);
          setPreviousCursors([]);
        }}
        options={[
          { value: "pending", label: "Pending" },
          { value: "reviewing", label: "Reviewing" },
          { value: "resolved", label: "Resolved" },
          { value: "dismissed", label: "Dismissed" },
        ]}
      />
      {query.isLoading ? <Skeleton style={{ height: 120 }} /> : null}
      {query.isError ? (
        <EmptyState
          icon="alert"
          title="Reports unavailable"
          description="Check your connection and try again."
          actionLabel="Try Again"
          onAction={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && query.data?.items.length === 0 ? (
        <EmptyState icon="check" title={`No ${status} reports`} description="The safety queue is clear." />
      ) : null}
      {query.data?.items.map((report) => (
        <Card key={report.id} style={styles.reportCard}>
          <BodyBold>
            Reported: {report.reported_user?.display_name || report.reported_user?.username || "Deleted account"}
          </BodyBold>
          <Caption>
            By {report.reporter?.display_name || report.reporter?.username || "Deleted account"}
          </Caption>
          <Text style={styles.reportCategory}>{report.category.replaceAll("_", " ")}</Text>
          {report.details ? <Text style={styles.reportDetails}>{report.details}</Text> : null}
          <AdminReportActions
            pending={actingId === report.id}
            status={status}
            onAction={(nextStatus) => {
              void updateReport(report.id, nextStatus);
            }}
          />
        </Card>
      ))}
      {query.data?.page && (previousCursors.length > 0 || query.data.page.has_more) ? (
        <View style={styles.pagination}>
          <Button
            disabled={previousCursors.length === 0}
            leftIcon="back"
            onPress={() => {
              const previous = previousCursors.at(-1) ?? null;
              setPreviousCursors((values) => values.slice(0, -1));
              setCursor(previous);
            }}
            size="sm"
            variant="secondary"
          >
            Previous
          </Button>
          <Caption>Page {previousCursors.length + 1}</Caption>
          <Button
            disabled={!query.data.page.has_more || !query.data.page.next_cursor}
            onPress={() => {
              const nextCursor = query.data?.page.next_cursor;
              if (!nextCursor) return;
              setPreviousCursors((values) => [...values, cursor]);
              setCursor(nextCursor);
            }}
            rightIcon="arrow-right"
            size="sm"
            variant="secondary"
          >
            Next
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function CoinsTab() {
  const queryClient = useQueryClient();
  const [placing, setPlacing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = useQuery(adminQueryOptions.coins());
  const coins = query.data ?? [];
  const placeMutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) => placeAdminCoin(lat, lng),
    onSuccess: (coin) => {
      queryClient.setQueryData<AdminCoin[]>(nativeQueryKeys.admin.coins, (current = []) => [coin, ...current]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAdminCoin,
    onSuccess: (_result, coinId) => {
      queryClient.setQueryData<AdminCoin[]>(nativeQueryKeys.admin.coins, (current = []) => (
        current.filter((coin) => coin.id !== coinId)
      ));
    },
  });

  async function placeCoin(coordinates: [number, number]) {
    if (!placing || placeMutation.isPending) return;
    try {
      await placeMutation.mutateAsync({ lng: coordinates[0], lat: coordinates[1] });
      setPlacing(false);
    } catch (error) {
      Alert.alert("Coin not placed", error instanceof Error ? error.message : "Try again.");
    }
  }

  async function deleteCoin(coinId: string) {
    setDeletingId(coinId);
    try {
      await deleteMutation.mutateAsync(coinId);
    } catch (error) {
      Alert.alert("Coin not deleted", error instanceof Error ? error.message : "Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.adminMapWrap}>
        <Mapbox.MapView
          compassEnabled={false}
          logoEnabled
          onPress={(event) => {
            const coordinates = event.geometry.coordinates;
            if (Array.isArray(coordinates) && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
              placeCoin([coordinates[0], coordinates[1]]);
            }
          }}
          scaleBarEnabled={false}
          style={styles.adminMap}
          styleURL="mapbox://styles/mapbox/dark-v11"
        >
          <Mapbox.Camera defaultSettings={{ centerCoordinate: DEFAULT_CENTER, zoomLevel: 12 }} />
          {coins.map((coin) => (
            <Mapbox.PointAnnotation coordinate={[coin.lng, coin.lat]} id={`admin-coin-${coin.id}`} key={coin.id}>
              <IconButton icon="coins" iconColor="#8b6100" iconSize={16} label="Delete coin" disabled={placing} onPress={() => deleteCoin(coin.id)} size={32} variant="ghost" visualStyle={styles.mapCoin} />
            </Mapbox.PointAnnotation>
          ))}
        </Mapbox.MapView>
        {placing ? (
          <View pointerEvents="none" style={styles.placeNotice}>
            {placeMutation.isPending ? <ActivityIndicator color={colors.surface} size={14} /> : null}
            <Text style={styles.placeNoticeText}>{placeMutation.isPending ? "Placing…" : "Tap on the map to place a coin"}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.coinHeader}>
        <View>
          <BodyBold>Placed Coins</BodyBold>
          <Caption>{coins.length} on map</Caption>
        </View>
        <Button disabled={placeMutation.isPending} leftIcon="coins" onPress={() => setPlacing((value) => !value)} size="sm" variant={placing ? "secondary" : "primary"}>
          {placing ? "Cancel" : "Place Coin"}
        </Button>
      </View>

      {query.isLoading ? (
        <CoinSkeleton />
      ) : query.isError ? (
        <EmptyState icon="alert" title="Failed to load coins" actionLabel="Try Again" onAction={() => void query.refetch()} />
      ) : coins.length === 0 ? (
        <EmptyState icon="alert" title="No coins placed yet" />
      ) : (
        <View style={styles.coinList}>
          {coins.map((coin) => (
            <Card flat key={coin.id} style={styles.coinRow}>
              <View style={styles.coinIcon}><IconGlyph name="coins" color="#9a6a00" size={16} /></View>
              <View style={styles.coinInfo}>
                <Caption numberOfLines={1}>{coin.id.slice(0, 8)}…</Caption>
                <Text style={styles.coords}>{coin.lat.toFixed(4)}, {coin.lng.toFixed(4)}</Text>
              </View>
              <IconButton icon="trash" iconColor={colors.danger[500]} iconSize={15} label="Delete coin" disabled={deletingId === coin.id} loading={deletingId === coin.id} onPress={() => deleteCoin(coin.id)} size={32} variant="ghost" />
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

function ModerationViewer({
  photo,
  status,
  acting,
  onApprove,
  onReject,
  onClose,
}: {
  photo: PhotoWithUser | null;
  status: PhotoApprovalStatus;
  acting: boolean;
  onApprove: (photo: PhotoWithUser) => void;
  onReject: (photo: PhotoWithUser) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!photo) return null;
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <StatusBar animated style="light" />
      <View style={styles.viewer}>
        <IconButton icon="close" iconColor={colors.surface} iconSize={20} label="Close photo" onPress={onClose} size={40} style={[styles.viewerClose, { top: insets.top + spacing[3] }]} variant="ghost" visualStyle={styles.viewerCloseVisual} />
        {status === "pending" ? (
          <View style={[styles.viewerActions, { top: insets.top + spacing[3] }]}>
            <Button disabled={acting} leftIcon="check" onPress={() => onApprove(photo)} size="sm">Approve</Button>
            <Button disabled={acting} leftIcon="close" onPress={() => onReject(photo)} size="sm" variant="danger">Reject</Button>
          </View>
        ) : null}
        {photo.url ? (
          <Image resizeMode="contain" source={{ uri: photo.url }} style={styles.viewerImage} />
        ) : null}
      </View>
    </Modal>
  );
}

function RejectDialog({
  open,
  reason,
  loading,
  onChangeReason,
  onCancel,
  onReject,
}: {
  open: boolean;
  reason: string;
  loading: boolean;
  onChangeReason: (reason: string) => void;
  onCancel: () => void;
  onReject: () => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={open}>
      <View style={styles.dialogRoot}>
        <Pressable onPress={onCancel} style={styles.dialogBackdrop} />
        <View style={styles.dialogCard}>
          <Title>Reject Photo</Title>
          <TextInput
            accessibilityLabel="Photo rejection reason"
            autoFocus
            multiline
            onChangeText={onChangeReason}
            placeholder="Enter rejection reason..."
            placeholderTextColor={colors.ink[5]}
            style={styles.reasonInput}
            textAlignVertical="top"
            value={reason}
          />
          <View style={styles.dialogActions}>
            <Button fullWidth disabled={!reason.trim() || loading} loading={loading} onPress={onReject} size="sm" style={styles.dialogButton} textStyle={styles.dialogButtonText} variant="danger">Reject</Button>
            <Button fullWidth disabled={loading} onPress={onCancel} size="sm" style={styles.dialogButton} textStyle={styles.dialogButtonText} variant="secondary">Cancel</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PhotoSkeleton() {
  return <View style={styles.photoGrid}>{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} style={styles.photoCard} />)}</View>;
}

function CoinSkeleton() {
  return <View style={styles.coinList}>{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} style={{ height: 58 }} />)}</View>;
}

const styles = StyleSheet.create({
  screen: { gap: spacing[6], paddingBottom: 112 },
  denied: { alignItems: "center", justifyContent: "center" },
  header: { gap: spacing[1] },
  section: { gap: spacing[4] },
  sectionGap: { gap: spacing[4] },
  reportCard: { gap: spacing[2], padding: spacing[4] },
  reportCategory: { ...typography.caption, color: "#92400e", textTransform: "capitalize", fontFamily: fontFamilies.semibold },
  reportDetails: { ...typography.body, color: colors.ink[7] },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  photoCard: { width: "48%", aspectRatio: 1, borderRadius: radii.lg, overflow: "hidden", backgroundColor: colors.ink[2] },
  photo: { width: "100%", height: "100%" },
  userBadge: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing[2], paddingTop: spacing[5], flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.ink[9] },
  userBadgeText: { ...typography.caption, color: colors.surface, flex: 1, fontFamily: fontFamilies.semibold },
  moderationActions: { position: "absolute", top: spacing[2], right: spacing[2], flexDirection: "row", gap: spacing[2] },
  actionLoader: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink[9], alignItems: "center", justifyContent: "center" },
  approve: { backgroundColor: colors.success[500] },
  reject: { backgroundColor: colors.danger[500] },
  rejectedBadge: { position: "absolute", left: 6, top: 6, borderRadius: radii.pill, backgroundColor: colors.danger[500], paddingHorizontal: spacing[2], paddingVertical: 3 },
  rejectedBadgeText: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 14, color: colors.surface },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[3] },
  adminMapWrap: { height: 360, borderRadius: radii.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  adminMap: { flex: 1 },
  mapCoin: { borderWidth: 2, borderColor: "#ca8f00", backgroundColor: "#f4c63d", ...shadows.e1 },
  placeNotice: { position: "absolute", alignSelf: "center", top: spacing[3], borderRadius: radii.pill, paddingHorizontal: spacing[4], paddingVertical: spacing[2], backgroundColor: colors.ink[9], flexDirection: "row", alignItems: "center", gap: spacing[2] },
  placeNoticeText: { ...typography.caption, color: colors.surface },
  coinHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coinList: { gap: spacing[2] },
  coinRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], padding: spacing[3] },
  coinIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#fff0b8" },
  coinInfo: { flex: 1, minWidth: 0 },
  coords: { ...typography.caption, color: colors.ink[5], fontVariant: ["tabular-nums"] },
  viewer: { flex: 1, backgroundColor: colors.ink[9], alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "82%" },
  viewerClose: { position: "absolute", right: spacing[4], zIndex: 3 },
  viewerCloseVisual: { backgroundColor: colors.ink[7] },
  viewerActions: { position: "absolute", alignSelf: "center", zIndex: 2, flexDirection: "row", gap: spacing[2] },
  dialogRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] },
  dialogBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.42)" },
  dialogCard: { width: "100%", maxWidth: 420, borderRadius: radii.lg, padding: spacing[5], gap: spacing[4], backgroundColor: colors.background, ...shadows.e2 },
  reasonInput: { minHeight: 96, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, padding: spacing[3], ...typography.body, color: colors.ink[9] },
  dialogActions: { gap: spacing[2] },
  dialogButton: { minHeight: 36 },
  dialogButtonText: { fontSize: 14, lineHeight: 20 },
});
