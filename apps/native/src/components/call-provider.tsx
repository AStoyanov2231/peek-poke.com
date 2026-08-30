import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import X from "lucide-react-native/icons/x";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import Phone from "lucide-react-native/icons/phone";
import PhoneOff from "lucide-react-native/icons/phone-off";
import SwitchCamera from "lucide-react-native/icons/switch-camera";
import Video from "lucide-react-native/icons/video";
import VideoOff from "lucide-react-native/icons/video-off";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  // react-doctor-disable-next-line rn-prefer-reanimated
  Animated,
  Modal,
  // react-doctor-disable-next-line rn-no-panresponder
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { RTCView } from "react-native-webrtc";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { colors, fontFamilies, shadows, spacing, typography } from "@peekpoke/design";
import { Avatar } from "@/components/ui";
import { fetchCurrentProfile } from "@/data/api";
import { nativeQueryKeys } from "@/data/query-keys";
import * as Crypto from "expo-crypto";
import { postNativeCallSignal } from "@/lib/call";
import { useNativeWebRTCCall } from "@/hooks/use-native-webrtc-call";
import { useCallStore, type ActiveCall, type IncomingInvite } from "@/state/call-store";

export function CallProvider() {
  const activeCall = useCallStore((state) => state.activeCall);
  const incomingInvite = useCallStore((state) => state.incomingInvite);
  return (
    <>
      {incomingInvite && !activeCall ? <IncomingCallOverlay invite={incomingInvite} /> : null}
      {activeCall ? <CallView call={activeCall} /> : null}
    </>
  );
}

function IncomingCallOverlay({ invite }: { invite: IncomingInvite }) {
  const name = invite.fromUser.display_name || invite.fromUser.username;
  const [isDeclining, setIsDeclining] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const decline = async () => {
    if (isDeclining) return;
    setIsDeclining(true);
    setDeclineError(null);
    try {
      const synchronized = await useCallStore.getState()
        .synchronizeTerminalCallFences(invite.accountId, invite.generation);
      const state = useCallStore.getState();
      const current = state.incomingInvite;
      if (
        !synchronized
        || !current
        || current.callId !== invite.callId
        || current.generation !== invite.generation
        || current.accountId !== invite.accountId
        || state.isTerminalCallFenced(invite.callId, invite.generation)
      ) {
        setIsDeclining(false);
        return;
      }
      await postNativeCallSignal(current.threadId, {
        version: 1,
        type: "reject",
        commandId: Crypto.randomUUID(),
        callId: current.callId,
        capability: current.capability,
        reason: "declined",
      });
      useCallStore.getState().clearInvite(current.callId, current.generation);
    } catch {
      setDeclineError("Could not decline the call. Check your connection and retry.");
      setIsDeclining(false);
    }
  };
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent visible>
      <StatusBar animated style="light" />
      <View style={styles.incomingBackdrop}>
        <View style={styles.callerInfo}>
          <View style={styles.callHalo}>
            <Avatar name={name} uri={invite.fromUser.avatar_url} size={96} />
          </View>
          <View style={styles.callerText}>
            <Text style={styles.callerName}>{name}</Text>
            <Text style={styles.incomingLabel}>Incoming video call</Text>
            {declineError ? <Text accessibilityRole="alert" style={styles.declineError}>{declineError}</Text> : null}
          </View>
        </View>
        <View style={styles.incomingActions}>
          <LabeledCallButton label="Decline">
            <CallButton label="Decline call" color={colors.danger[500]} onPress={decline} disabled={isDeclining || isAccepting} size={64}>
              <PhoneOff color={colors.surface} size={26} />
            </CallButton>
          </LabeledCallButton>
          <LabeledCallButton label="Accept">
            <CallButton
              label="Accept call"
              color={colors.success[500]}
              onPress={() => {
                if (isAccepting || isDeclining) return;
                setIsAccepting(true);
                void useCallStore.getState()
                  .acceptCall(invite.callId, invite.generation)
                  .then((accepted) => {
                    if (!accepted) setIsAccepting(false);
                  });
              }}
              disabled={isDeclining || isAccepting}
              size={64}
            >
              <Phone color={colors.surface} size={26} />
            </CallButton>
          </LabeledCallButton>
        </View>
      </View>
    </Modal>
  );
}

function CallView({ call }: { call: ActiveCall }) {
  const insets = useSafeAreaInsets();
  const selfProfile = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  }).data;
  const [seconds, setSeconds] = useState(0);
  const {
    localStream,
    remoteStream,
    isMicMuted,
    isCameraOff,
    hasMultipleCameras,
    permissionError,
    isEnding,
    toggleMic,
    toggleCamera,
    flipCamera,
    endCall,
  } = useNativeWebRTCCall(call);

  useEffect(() => {
    if (call.status !== "connected") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [call.status]);
  useEffect(() => {
    if (call.status !== "failed") return;
    const timer = setTimeout(() => useCallStore.getState().clearCall(call.callId, call.generation), 2_500);
    return () => clearTimeout(timer);
  }, [call.callId, call.generation, call.status]);

  const name = call.peer.display_name || call.peer.username;
  const statusText = call.status === "calling"
    ? "Calling…"
    : call.status === "connecting"
      ? "Connecting…"
      : call.status === "connected"
        ? `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
        : call.status === "ended"
          ? "Call ended"
          : permissionError ?? "Call failed";

  return (
    <Modal animationType="fade" statusBarTranslucent navigationBarTranslucent visible>
      <StatusBar animated style="light" />
      <View style={styles.callRoot}>
        {remoteStream ? (
          <RTCView streamURL={remoteStream.toURL()} objectFit="cover" style={StyleSheet.absoluteFill} zOrder={0} />
        ) : (
          <View style={styles.remotePlaceholder}>
            <Avatar name={name} uri={call.peer.avatar_url} size={call.status === "connected" ? 80 : 96} />
            {call.status === "connected" ? <VideoOff color="rgba(255,255,255,0.5)" size={18} /> : null}
            {call.status !== "connected" ? <Text style={styles.callStatus}>{statusText}</Text> : null}
          </View>
        )}

        <SelfView streamUrl={localStream?.toURL()} cameraOff={isCameraOff} name={selfProfile?.display_name || selfProfile?.username || "You"} uri={selfProfile?.avatar_url} />

        <LinearGradient
          colors={["rgba(0,0,0,0.68)", "rgba(0,0,0,0)"]}
          style={[styles.callHeader, { paddingTop: insets.top + 14 }]}
        >
          <CallButton label={isEnding ? "Ending call" : "End call and close"} color="transparent" onPress={endCall} disabled={isEnding} size={40}>
            <X color={colors.surface} size={22} />
          </CallButton>
          <Avatar name={name} uri={call.peer.avatar_url} size={36} />
          <View style={styles.callHeaderText}>
            <Text numberOfLines={1} style={styles.callPeerName}>{name}</Text>
            <Text style={styles.callHeaderStatus}>{statusText}</Text>
          </View>
        </LinearGradient>

        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.74)"]}
          style={[styles.callControls, { paddingBottom: insets.bottom + 32 }]}
        >
          <CallButton label={isMicMuted ? "Unmute microphone" : "Mute microphone"} color="rgba(255,255,255,0.14)" onPress={toggleMic}>
            {isMicMuted ? <MicOff color={colors.surface} size={22} /> : <Mic color={colors.surface} size={22} />}
          </CallButton>
          <CallButton label={isCameraOff ? "Turn camera on" : "Turn camera off"} color="rgba(255,255,255,0.14)" onPress={toggleCamera}>
            {isCameraOff ? <VideoOff color={colors.surface} size={22} /> : <Video color={colors.surface} size={22} />}
          </CallButton>
          <CallButton label={isEnding ? "Ending call" : "End call"} color={colors.danger[500]} onPress={endCall} disabled={isEnding} size={64}>
            <PhoneOff color={colors.surface} size={26} />
          </CallButton>
          {hasMultipleCameras ? (
            <CallButton label="Flip camera" color="rgba(255,255,255,0.14)" onPress={flipCamera}>
              <SwitchCamera color={colors.surface} size={22} />
            </CallButton>
          ) : <View style={styles.controlSpacer} />}
        </LinearGradient>
      </View>
    </Modal>
  );
}

function SelfView({ streamUrl, cameraOff, name, uri }: { streamUrl?: string; cameraOff: boolean; name: string; uri?: string | null }) {
  const { width, height } = useWindowDimensions();
  const initialPosition = { x: width - 132, y: 116 };
  const [position] = useState(() => new Animated.ValueXY(initialPosition));
  const [origin, setOrigin] = useState(initialPosition);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onPanResponderMove: (_event, gesture) => {
      position.setValue({ x: origin.x + gesture.dx, y: origin.y + gesture.dy });
    },
    onPanResponderRelease: (_event, gesture) => {
      const next = {
        x: Math.max(spacing[3], Math.min(width - 120, origin.x + gesture.dx)),
        y: Math.max(88, Math.min(height - 238, origin.y + gesture.dy)),
      };
      setOrigin(next);
      position.setValue(next);
    },
  }), [height, origin, position, width]);
  return (
    <Animated.View style={[styles.selfView, position.getLayout()]} {...panResponder.panHandlers}>
      {streamUrl && !cameraOff ? (
        <RTCView mirror objectFit="cover" streamURL={streamUrl} style={StyleSheet.absoluteFill} zOrder={1} />
      ) : (
        <View style={styles.selfPlaceholder}><Avatar name={name} uri={uri} size={44} /></View>
      )}
    </Animated.View>
  );
}

function CallButton({ children, label, color, size = 48, onPress, disabled = false }: { children: ReactNode; label: string; color: string; size?: number; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.callButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        disabled && styles.callButtonDisabled,
        pressed && styles.callButtonPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function LabeledCallButton({ children, label }: { children: ReactNode; label: string }) {
  return <View style={styles.labeledButton}>{children}<Text style={styles.buttonLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  incomingBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink[9] },
  callerInfo: { alignItems: "center", gap: spacing[4], marginBottom: 64 },
  callHalo: { padding: spacing[2], borderRadius: 60, backgroundColor: colors.ink[7] },
  callerText: { alignItems: "center", gap: spacing[1] },
  callerName: { fontFamily: fontFamilies.semibold, fontSize: 24, lineHeight: 29, color: colors.surface },
  incomingLabel: { ...typography.callout, color: "rgba(255,255,255,0.6)" },
  declineError: { ...typography.caption, maxWidth: 280, marginTop: spacing[2], color: "#ffaaa5", textAlign: "center" },
  incomingActions: { flexDirection: "row", alignItems: "center", gap: 64 },
  labeledButton: { alignItems: "center", gap: spacing[2] },
  buttonLabel: { ...typography.caption, color: "rgba(255,255,255,0.6)" },
  callRoot: { flex: 1, overflow: "hidden", backgroundColor: "#000" },
  remotePlaceholder: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: spacing[3], backgroundColor: "#000" },
  callStatus: { ...typography.callout, color: "rgba(255,255,255,0.7)" },
  callHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, minHeight: 108, paddingHorizontal: spacing[4], paddingBottom: spacing[4], flexDirection: "row", alignItems: "center", gap: spacing[3] },
  callHeaderText: { flex: 1, minWidth: 0 },
  callPeerName: { fontFamily: fontFamilies.semibold, fontSize: 14, lineHeight: 18, color: colors.surface },
  callHeaderStatus: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 16, color: "rgba(255,255,255,0.6)" },
  callControls: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, minHeight: 154, paddingHorizontal: spacing[6], paddingTop: spacing[6], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[5] },
  callButton: { alignItems: "center", justifyContent: "center", ...shadows.e2 },
  callButtonPressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  callButtonDisabled: { opacity: 0.5 },
  controlSpacer: { width: 48, height: 48 },
  selfView: { position: "absolute", zIndex: 5, width: 108, height: 152, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)", overflow: "hidden", backgroundColor: "#24242b", ...shadows.e2 },
  selfPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
});
