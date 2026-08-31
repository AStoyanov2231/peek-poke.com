import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ScanLine from "lucide-react-native/icons/scan-line";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { roomQrPayloadSchema } from "@peekpoke/shared";
import { colors, radii, spacing } from "@peekpoke/design";
import { Button, Caption, Muted } from "@/components/ui";
import { joinRoom } from "@/data/rooms";
import { nativeQueryKeys } from "@/data/query-keys";

export default function ScanRoomScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const queryClient = useQueryClient();
  const [scanned, setScanned] = useState(false);
  const [manualPayload, setManualPayload] = useState("");
  const [error, setError] = useState<string | null>(null);
  const joinMutation = useMutation({
    mutationFn: joinRoom,
    onSuccess: (response) => {
      // The capability is not persisted after the server resolves it.
      setManualPayload("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
      router.replace({ pathname: "/(app)/room/[roomId]", params: { roomId: response.room.id } } as never);
    },
    onError: (failure) => {
      setScanned(false);
      setError(failure instanceof Error ? failure.message : "That QR code could not be used.");
    },
  });

  const submitPayload = useCallback((payload: string) => {
    if (joinMutation.isPending) return;
    const normalized = payload.trim();
    if (!roomQrPayloadSchema.safeParse(normalized).success) {
      setError("That is not a Peek & Poke table QR code.");
      setScanned(false);
      return;
    }
    setError(null);
    setScanned(true);
    joinMutation.mutate(normalized);
  }, [joinMutation]);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (scanned) return;
    submitPayload(result.data);
  }, [scanned, submitPayload]);

  if (!permission) return <View style={styles.center}><ActivityIndicator color={colors.primary[500]} /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <ScanLine color={colors.primary[500]} size={36} />
        <Text style={styles.title}>Scan a table QR code</Text>
        <Muted style={styles.copy}>Camera access is needed to join the room assigned to this table.</Muted>
        <Button style={styles.permissionButton} onPress={() => void requestPermission()}>Allow camera</Button>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>Cancel</Button>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.ink[9]} size={22} /></Pressable>
        <Text style={styles.headerTitle}>Join a room</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.cameraFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        />
        <View pointerEvents="none" style={styles.scanWindow} />
      </View>
      <Text style={styles.title}>Scan a table QR code</Text>
      <Caption style={styles.instruction}>Point your camera at the QR code on your table.</Caption>
      {joinMutation.isPending ? <ActivityIndicator style={styles.spinner} color={colors.primary[500]} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.manual}>
        <TextInput
          value={manualPayload}
          onChangeText={setManualPayload}
          placeholder="Paste a table code"
          placeholderTextColor={colors.ink[5]}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Table QR code"
          style={styles.input}
        />
        <Button size="sm" disabled={!manualPayload.trim() || joinMutation.isPending} onPress={() => submitPayload(manualPayload)}>Join</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, padding: spacing[4] },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: spacing[5] },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: spacing[4] },
  back: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  headerTitle: { color: colors.ink[9], fontSize: 17, fontWeight: "700" },
  cameraFrame: { aspectRatio: 1, backgroundColor: "black", borderRadius: radii.lg, overflow: "hidden", width: "100%" },
  scanWindow: { alignSelf: "center", borderColor: "rgba(255,255,255,0.9)", borderRadius: 18, borderWidth: 2, height: "65%", marginTop: "17.5%", width: "65%" },
  title: { color: colors.ink[9], fontSize: 20, fontWeight: "700", marginTop: spacing[5], textAlign: "center" },
  copy: { marginTop: spacing[2], textAlign: "center" },
  permissionButton: { marginTop: spacing[5], minWidth: 180 },
  instruction: { marginTop: spacing[1], textAlign: "center" },
  spinner: { marginTop: spacing[3] },
  error: { color: colors.danger[500], fontSize: 13, marginTop: spacing[3], textAlign: "center" },
  manual: { alignItems: "center", flexDirection: "row", gap: spacing[2], marginTop: spacing[5] },
  input: { backgroundColor: colors.surface, borderColor: colors.hairline, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, color: colors.ink[9], flex: 1, height: 44, paddingHorizontal: spacing[3] },
});
