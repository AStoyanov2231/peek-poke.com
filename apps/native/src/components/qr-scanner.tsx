import { CameraView, useCameraPermissions } from "expo-camera";
import { AppState, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { colors, radii, shadows, spacing, typography } from "@peekpoke/design";
import { sharedGroupQrContentError } from "@peekpoke/shared";
import { Button, Caption, IconButton } from "@/components/ui";

type ScannerState = "starting" | "scanning" | "submitting" | "success" | "denied" | "unsupported" | "error";

export function QrScanner({
  open,
  onClose,
  onDecoded,
}: {
  open: boolean;
  onClose: () => void;
  onDecoded: (content: string) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScannerState>("starting");
  const [manualContent, setManualContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const submittingRef = useRef(false);
  const retryContentRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submittingRef.current = false;
      retryContentRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (permission?.granted) {
      // Permission is an external native state that controls the scanner view.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("scanning");
      return;
    }
    if (permission && !permission.canAskAgain) {
      // Permission is an external native state that controls the scanner view.
      setState("denied");
      setError("Camera access was denied. Allow camera access in your device settings, or enter the QR text below.");
      return;
    }
    void requestPermission().then((next) => {
      if (!mountedRef.current || !open) return;
      if (next.granted) setState("scanning");
      else {
        setState("denied");
        setError("Camera access was denied. Allow camera access in your device settings, or enter the QR text below.");
      }
    }).catch(() => {
      if (!mountedRef.current || !open) return;
      setState("error");
      setError("The camera could not start. Try again or enter the QR text below.");
    });
  }, [open, permission, requestPermission]);

  useEffect(() => {
    if (!open) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" && !submittingRef.current) onClose();
    });
    return () => subscription.remove();
  }, [onClose, open]);

  async function submit(content: string) {
    if (submittingRef.current) return;
    const contentError = sharedGroupQrContentError(content);
    if (contentError) {
      retryContentRef.current = null;
      setRetryAvailable(false);
      setState("error");
      setError(contentError === "too_long"
        ? "This QR code is too long. Enter a shorter QR text below."
        : "This QR code is empty or invalid. Enter the QR text below.");
      return;
    }
    submittingRef.current = true;
    retryContentRef.current = content;
    setRetryAvailable(true);
    setState("submitting");
    setError(null);
    try {
      await onDecoded(content);
      retryContentRef.current = null;
      if (mountedRef.current) {
        setRetryAvailable(false);
        setState("success");
      }
    } catch {
      if (!mountedRef.current) return;
      submittingRef.current = false;
      setState("error");
      setError("This QR code could not be joined. Check your connection and try again.");
    }
  }

  const canSubmitManual = manualContent.length > 0;
  const statusCopy = state === "starting"
    ? "Starting camera…"
    : state === "scanning"
      ? "Point your camera at any QR code"
      : state === "submitting"
        ? "Joining shared group…"
        : state === "success"
          ? "Shared group joined"
          : "Camera scanning is unavailable";

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Join a shared group</Text>
              <Caption>Scan any QR code to create or join its shared group.</Caption>
            </View>
            <IconButton icon="close" label="Close QR scanner" size={40} variant="ghost" onPress={onClose} />
          </View>

          <View style={styles.previewWrap}>
            {permission?.granted && state !== "submitting" && state !== "success" ? (
              <CameraView
                active={open && state === "scanning"}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => void submit(data)}
                onMountError={() => {
                  if (!submittingRef.current) {
                    setState("unsupported");
                    setError("No camera is available in this environment. Enter the QR text below instead.");
                  }
                }}
                facing="back"
                style={styles.preview}
              />
            ) : null}
            {state !== "scanning" && state !== "submitting" && state !== "success" ? (
              <View style={styles.previewMessage}>
                <Text style={styles.previewMessageText}>{statusCopy}</Text>
              </View>
            ) : null}
            {state === "submitting" ? (
              <View style={styles.previewMessage}>
                <Text style={styles.previewMessageText}>Joining shared group…</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.status}>{statusCopy}</Text>
          <Caption>
            Anyone with the same code can join. Scanning is not proof of physical presence, and Peek &amp; Poke never opens QR links.
          </Caption>
          {error ? (
            <View accessibilityRole="alert" style={styles.errorRow}>
              <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>
              {retryAvailable ? <Button onPress={() => {
                const content = retryContentRef.current;
                if (content) void submit(content);
              }} size="sm" variant="secondary">Retry</Button> : null}
            </View>
          ) : null}

          <View style={styles.manualSection}>
            <Text style={styles.manualLabel}>Can’t scan? Enter the QR text</Text>
            <View style={styles.manualRow}>
              <TextInput
                accessibilityLabel="QR text"
                autoCapitalize="none"
                autoCorrect={false}
                editable={state !== "submitting"}
                multiline
                numberOfLines={3}
                onChangeText={setManualContent}
                placeholder="Paste QR text"
                placeholderTextColor={colors.ink[5]}
                style={styles.input}
                textAlignVertical="top"
                value={manualContent}
              />
              <Button
                disabled={!canSubmitManual || state === "submitting"}
                onPress={() => void submit(manualContent)}
                size="md"
                variant="secondary"
              >
                Join
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.scrim,
  },
  card: {
    maxHeight: "94%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing[4],
    gap: spacing[3],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  headerText: { flex: 1, minWidth: 0, gap: spacing[1] },
  title: { ...typography.title3, color: colors.ink[9] },
  previewWrap: {
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: colors.ink[9],
  },
  preview: { flex: 1 },
  previewMessage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  previewMessageText: { ...typography.bodyBold, color: colors.surface, textAlign: "center" },
  status: { ...typography.bodyBold, color: colors.ink[9] },
  error: { ...typography.caption, color: colors.danger[500], flex: 1 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  manualSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, paddingTop: spacing[3], gap: spacing[2] },
  manualLabel: { ...typography.caption, color: colors.ink[7] },
  manualRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    color: colors.ink[9],
    ...typography.body,
  },
});
