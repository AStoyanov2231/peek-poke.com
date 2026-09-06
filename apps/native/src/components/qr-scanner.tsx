import { CameraView, useCameraPermissions } from "expo-camera";
import { AppState, Modal, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "@peekpoke/design";
import { sharedGroupQrContentError } from "@peekpoke/shared";
import { Button, Caption, IconButton } from "@/components/ui";

type ScannerState = "starting" | "scanning" | "submitting" | "success" | "denied" | "no-camera" | "error";

function stateCopy(state: ScannerState) {
  switch (state) {
    case "starting": return "Starting camera";
    case "scanning": return "Align a QR code inside the frame";
    case "submitting": return "Joining shared group";
    case "success": return "Shared group joined";
    case "denied": return "Camera access is blocked";
    case "no-camera": return "No camera found";
    case "error": return "Camera could not start";
  }
}

function errorCopy(state: ScannerState) {
  switch (state) {
    case "denied": return "Camera access is blocked. Allow it in your device settings, then try again.";
    case "no-camera": return "No camera was found. Connect a camera and try again.";
    case "error": return "The camera could not start. Try again.";
    default: return null;
  }
}

// Scanner lifecycle is intentionally kept together so acquisition, decoding, and
// cleanup share the same disposed and duplicate-submission fences.
// react-doctor-disable-next-line no-high-complexity-react-function
export function QrScanner({
  open,
  onClose,
  onDecoded,
}: {
  open: boolean;
  onClose: () => void;
  onDecoded: (content: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScannerState>("starting");
  const [error, setError] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [permissionRetry, setPermissionRetry] = useState(0);
  const submittingRef = useRef(false);
  const permissionRequestAttemptedRef = useRef(false);
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
    if (!open) {
      permissionRequestAttemptedRef.current = false;
      return;
    }
    if (permission?.granted || (permission && !permission.canAskAgain)) return;
    if (permissionRequestAttemptedRef.current) return;
    permissionRequestAttemptedRef.current = true;
    void requestPermission().then((next) => {
      if (!mountedRef.current || !open || submittingRef.current) return;
      if (next.granted) {
        setState("scanning");
        setError(null);
      } else {
        setState("denied");
        setError(errorCopy("denied"));
      }
    }).catch(() => {
      if (!mountedRef.current || !open) return;
      setState("error");
      setError(errorCopy("error"));
    });
  }, [open, permission, permissionRetry, requestPermission]);

  useEffect(() => {
    if (!open) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        (nextState === "background" || (nextState === "inactive" && permission?.granted))
        && !submittingRef.current
      ) onClose();
    });
    return () => subscription.remove();
  }, [onClose, open, permission?.granted]);

  async function submit(content: string) {
    if (submittingRef.current) return;
    const contentError = sharedGroupQrContentError(content);
    if (contentError) {
      retryContentRef.current = null;
      setRetryAvailable(false);
      setState("error");
      setError(contentError === "too_long"
        ? "This QR code is too long to scan. Try another QR code."
        : "This QR code is empty or invalid. Try another QR code.");
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

  const permissionDenied = Boolean(permission && !permission.granted && !permission.canAskAgain);
  const renderedState: ScannerState = permissionDenied
    && state !== "submitting"
    && state !== "error"
    && state !== "success"
    ? "denied"
    : permission?.granted && state === "starting"
      ? "scanning"
      : state;
  const renderedError = permissionDenied
    && renderedState === "denied"
    ? errorCopy("denied")
    : error ?? errorCopy(renderedState);
  const status = stateCopy(renderedState);
  const isBusy = renderedState === "starting" || renderedState === "submitting";
  const canRetry = retryAvailable || (!permissionDenied && (renderedState === "denied" || renderedState === "no-camera" || renderedState === "error"));
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.root}>
        <View style={styles.previewWrap}>
          {permission?.granted && renderedState !== "submitting" && renderedState !== "success" ? (
            <CameraView
              active={open && renderedState === "scanning"}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => void submit(data)}
              onMountError={() => {
                if (!submittingRef.current) {
                  setState("no-camera");
                  setError(errorCopy("no-camera"));
                }
              }}
              facing="back"
              style={styles.preview}
            />
          ) : null}
          <View pointerEvents="none" style={styles.previewShade} />
          <View pointerEvents="none" style={styles.frameAnchor}>
            <View style={styles.scanFrame} />
          </View>
          <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Scan to join</Text>
              <Caption style={styles.headerCaption}>Join the group linked to this QR code</Caption>
            </View>
            <IconButton icon="close" label="Close QR scanner" size={44} variant="ghost" onPress={onClose} />
          </View>
          {renderedState !== "scanning" && renderedState !== "submitting" && renderedState !== "success" ? (
            <View style={styles.previewMessage}>
              <Text style={styles.previewMessageText}>{status}</Text>
            </View>
          ) : null}
          {renderedState === "submitting" ? (
            <View style={styles.previewMessage}>
              <Text style={styles.previewMessageText}>Joining shared group…</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
          <Caption style={styles.disclaimer}>
            Anyone with the same code can join. QR links are never opened.
          </Caption>
          {renderedError ? (
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{renderedError}</Text>
          ) : null}
          <Button
            disabled={isBusy || renderedState === "scanning" || renderedState === "success" || !canRetry}
            fullWidth
            leftIcon="qr"
            onPress={() => {
              if (retryAvailable) {
                const content = retryContentRef.current;
                if (content) void submit(content);
              } else {
                permissionRequestAttemptedRef.current = false;
                setPermissionRetry((value) => value + 1);
                setState(permission?.granted ? "scanning" : "starting");
                setError(null);
              }
            }}
            size="lg"
            variant="accent"
          >
            {retryAvailable ? "Retry joining" : renderedState === "scanning" ? "Scanning for QR code" : "Try camera again"}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink[9] },
  previewWrap: { flex: 1, minHeight: 0, backgroundColor: colors.ink[9] },
  preview: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  previewShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.22)" },
  frameAnchor: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  scanFrame: {
    width: "78%",
    maxWidth: 520,
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radii.xl,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  headerText: { flex: 1, minWidth: 0, gap: spacing[1] },
  title: { ...typography.title3, color: colors.surface },
  headerCaption: { color: "rgba(255,255,255,0.7)" },
  previewMessage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  previewMessageText: {
    ...typography.bodyBold,
    color: colors.surface,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: radii.lg,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
  },
  controls: {
    flexShrink: 0,
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  status: { ...typography.bodyBold, color: colors.surface },
  disclaimer: { color: "rgba(255,255,255,0.66)" },
  error: { ...typography.caption, color: "#ffaaa3" },
});
