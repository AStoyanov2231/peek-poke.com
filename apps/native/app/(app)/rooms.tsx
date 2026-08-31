import * as Clipboard from "expo-clipboard";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import QrCode from "lucide-react-native/icons/qr-code";
import Users from "lucide-react-native/icons/users";
import X from "lucide-react-native/icons/x";
import QRCode from "react-native-qrcode-svg";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing } from "@peekpoke/design";
import { Button, Card, Caption, Muted, Screen, Title } from "@/components/ui";
import { createRoom, roomsQueryOptions } from "@/data/rooms";
import { nativeQueryKeys } from "@/data/query-keys";

export default function RoomsScreen() {
  const queryClient = useQueryClient();
  const roomsQuery = useInfiniteQuery(roomsQueryOptions);
  const rooms = roomsQuery.data?.pages.flatMap((page) => page.rooms) ?? [];
  const [createdRoom, setCreatedRoom] = useState<{ id: string; qrPayload: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: (response) => {
      setError(null);
      setCreatedRoom({ id: response.room.id, qrPayload: response.qr_payload });
      void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
    },
    onError: () => setError("A room could not be created. Try again."),
  });

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Caption style={styles.eyebrow}>PEEK &amp; POKE</Caption>
          <Title>Room together.</Title>
          <Muted style={styles.description}>Scan the QR code on your table to join its shared conversation. Rooms add group chat alongside the map and Inbox.</Muted>
        </View>
        <QrCode color={colors.primary[500]} size={30} strokeWidth={1.6} />
      </View>

      <View style={styles.actions}>
        <Button fullWidth leftIcon="camera" onPress={() => router.push("/(app)/scan" as never)}>Scan a table QR code</Button>
        <Button fullWidth variant="secondary" leftIcon="share" loading={createMutation.isPending} onPress={() => createMutation.mutate()}>Create a share QR</Button>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your rooms</Text>
        {roomsQuery.isFetching ? <Caption>Refreshing…</Caption> : null}
      </View>
      {roomsQuery.isError ? (
        <Card><Text style={styles.body}>Rooms could not be loaded.</Text><Button size="sm" variant="secondary" style={styles.retry} onPress={() => void roomsQuery.refetch()}>Try again</Button></Card>
      ) : roomsQuery.isPending ? (
        <Card><Muted>Loading rooms…</Muted></Card>
      ) : rooms.length === 0 ? (
        <Card style={styles.empty}>
          <Users color={colors.primary[500]} size={28} />
          <Text style={styles.emptyTitle}>No rooms yet</Text>
          <Muted style={styles.emptyCopy}>Scan a room QR code or create one to start chatting.</Muted>
        </Card>
      ) : (
        <View style={styles.list}>
          {rooms.map((room) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${room.name}`}
              key={room.id}
              onPress={() => router.push({ pathname: "/(app)/room/[roomId]", params: { roomId: room.id } } as never)}
              style={({ pressed }) => [styles.roomRow, pressed && styles.pressed]}
            >
              <View style={styles.roomIcon}><Users color={colors.primary[500]} size={20} /></View>
              <View style={styles.roomCopy}>
                <Text numberOfLines={1} style={styles.roomName}>{room.name}</Text>
                <Caption>{room.member_count} {room.member_count === 1 ? "member" : "members"}</Caption>
              </View>
              {room.unread_count > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{room.unread_count > 9 ? "9+" : room.unread_count}</Text></View> : null}
            </Pressable>
          ))}
          {roomsQuery.hasNextPage ? (
            <Button
              fullWidth
              variant="secondary"
              loading={roomsQuery.isFetchingNextPage}
              onPress={() => void roomsQuery.fetchNextPage()}
            >
              {roomsQuery.isFetchingNextPage ? "Loading more rooms…" : "Load more rooms"}
            </Button>
          ) : null}
        </View>
      )}

      <Modal visible={createdRoom !== null} transparent animationType="fade" onRequestClose={() => setCreatedRoom(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close QR code" onPress={() => setCreatedRoom(null)} style={styles.close}><X color={colors.ink[6]} size={20} /></Pressable>
            <Text style={styles.modalTitle}>Share this room QR</Text>
            <Muted style={styles.modalCopy}>A secondary share code for inviting people to this group room.</Muted>
            {createdRoom ? <View style={styles.qrWrap}><QRCode value={createdRoom.qrPayload} size={220} backgroundColor="white" color="black" /></View> : null}
            <View style={styles.modalActions}>
              <Button size="sm" variant="secondary" onPress={() => { if (createdRoom) void Clipboard.setStringAsync(createdRoom.qrPayload); }}>Copy code</Button>
              <Button size="sm" onPress={() => { if (!createdRoom) return; const id = createdRoom.id; setCreatedRoom(null); router.push({ pathname: "/(app)/room/[roomId]", params: { roomId: id } } as never); }}>Open room</Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing[3] },
  headingCopy: { flex: 1, gap: spacing[2] },
  eyebrow: { color: colors.primary[500], letterSpacing: 1.5 },
  description: { lineHeight: 20, marginTop: spacing[1] },
  actions: { gap: spacing[3], marginTop: spacing[6] },
  error: { color: colors.danger[500], fontSize: 13, marginTop: spacing[2] },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing[8], marginBottom: spacing[3] },
  sectionTitle: { color: colors.ink[9], fontSize: 18, fontWeight: "700" },
  body: { color: colors.ink[8], fontSize: 15 },
  retry: { marginTop: spacing[3], alignSelf: "flex-start" },
  empty: { alignItems: "center", paddingVertical: spacing[8] },
  emptyTitle: { color: colors.ink[8], fontSize: 16, fontWeight: "700", marginTop: spacing[3] },
  emptyCopy: { textAlign: "center", marginTop: spacing[1] },
  list: { gap: spacing[2] },
  roomRow: { alignItems: "center", flexDirection: "row", gap: spacing[3], backgroundColor: colors.surface, borderColor: colors.hairline, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 68, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  pressed: { opacity: 0.72 },
  roomIcon: { alignItems: "center", backgroundColor: colors.primary[50], borderRadius: 24, height: 44, justifyContent: "center", width: 44 },
  roomCopy: { flex: 1, gap: 2 },
  roomName: { color: colors.ink[9], fontSize: 15, fontWeight: "700" },
  badge: { alignItems: "center", backgroundColor: colors.primary[500], borderRadius: 12, minWidth: 24, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { color: colors.primary.contrast, fontSize: 11, fontWeight: "700" },
  modalBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)", flex: 1, justifyContent: "center", padding: spacing[4] },
  modalCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 20, padding: spacing[5], width: "100%", ...shadows.e2 },
  close: { alignSelf: "flex-end", padding: spacing[1] },
  modalTitle: { color: colors.ink[9], fontSize: 19, fontWeight: "700" },
  modalCopy: { marginTop: spacing[1], textAlign: "center" },
  qrWrap: { backgroundColor: "white", borderRadius: radii.lg, marginTop: spacing[5], padding: spacing[3] },
  modalActions: { flexDirection: "row", gap: spacing[2], marginTop: spacing[5] },
});
