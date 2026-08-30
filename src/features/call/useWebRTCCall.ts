"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  callTerminalCommandTypes,
  createCallCommandQueue,
  parseScopedCallSignalEvent,
  type CallSignalCommand,
  type CallSignalEvent,
} from "@peekpoke/shared";
import { createClient } from "@/lib/supabase/client";
import { getIceServers } from "@/lib/webrtc/iceServers";
import {
  CALL_SIGNAL_EVENT,
  CallSignalRequestError,
  postCallSignal,
} from "@/lib/webrtc/signaling";
import { useCallStore, type ActiveCall } from "@/stores/callStore";

const supabase = createClient();
const RING_TIMEOUT_MS = 30_000;
const DISCONNECT_GRACE_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 25_000;

function subscribeToCallChannel(
  channel: RealtimeChannel,
  handler: ({ payload }: { payload?: unknown }) => void,
  callback: (status: string) => void,
) {
  channel.on("broadcast", { event: CALL_SIGNAL_EVENT }, handler);
  return channel.subscribe(callback);
}

export function useWebRTCCall(call: ActiveCall) {
  const {
    accountId,
    generation,
    threadId,
    callId,
    direction,
    peer,
  } = call;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalIceRef = useRef<Extract<CallSignalCommand, { type: "ice" }>["candidate"][]>([]);
  const localDescriptionCommandQueuedRef = useRef(false);
  const hasRemoteDescriptionRef = useRef(false);
  const facingModeRef = useRef<"user" | "environment">("user");
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capabilityRef = useRef(call.capability);
  const lastSequenceRef = useRef(call.lastSequence);
  const latestStatusRef = useRef(call.status);
  const eventQueueRef = useRef<Promise<void> | null>(null);
  const [initCommandId] = useState(() => crypto.randomUUID());
  const mountedRef = useRef(true);
  const terminalSettledRef = useRef(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    latestStatusRef.current = call.status;
  }, [call.status]);

  const isCurrentCall = useCallback(() => {
    const current = useCallStore.getState().activeCall;
    return current?.accountId === accountId
      && current.callId === callId
      && current.generation === generation;
  }, [accountId, callId, generation]);

  const setScopedStatus = useCallback((status: ActiveCall["status"]) => {
    useCallStore.getState().setCallStatus(callId, generation, status);
  }, [callId, generation]);

  const cleanup = useCallback(() => {
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (disconnectTimeoutRef.current) clearTimeout(disconnectTimeoutRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    ringTimeoutRef.current = null;
    disconnectTimeoutRef.current = null;
    heartbeatIntervalRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    hasRemoteDescriptionRef.current = false;
    iceQueueRef.current = [];
    pendingLocalIceRef.current = [];
    localDescriptionCommandQueuedRef.current = false;
    if (mountedRef.current) {
      setLocalStream(null);
      setRemoteStream(null);
    }
  }, []);

  const failCall = useCallback((message?: string) => {
    if (!isCurrentCall()) return;
    if (message && mountedRef.current) setPermissionError(message);
    setScopedStatus("failed");
    cleanup();
  }, [cleanup, isCurrentCall, setScopedStatus]);

  const observeAck = useCallback((capability: string, sequence: number, commitToStore: boolean) => {
    capabilityRef.current = capability;
    lastSequenceRef.current = Math.max(lastSequenceRef.current, sequence);
    if (commitToStore) {
      useCallStore.getState().setCallSession(
        callId,
        generation,
        capability,
        lastSequenceRef.current,
      );
    }
  }, [callId, generation]);

  const [commandQueue] = useState(() => createCallCommandQueue({
    dispatch: (command, signal) => postCallSignal(threadId, command, signal),
    isConflict: (error) => error instanceof CallSignalRequestError && error.status === 409,
  }));

  const enqueueCommand = useCallback(
    (createCommand: () => CallSignalCommand) => commandQueue.enqueue(createCommand, {
      isCurrent: isCurrentCall,
      observeAck: (acknowledgement, _command, commitToCurrentStore) => {
        observeAck(
          acknowledgement.capability,
          acknowledgement.acceptedSequence,
          commitToCurrentStore,
        );
      },
    }),
    [commandQueue, isCurrentCall, observeAck],
  );

  const isTerminalDispatchCurrent = useCallback(() => {
    try {
      const state = useCallStore.getState();
      const activeCall = state.activeCall;
      return state.accountId === accountId
        && state.generation === generation
        && state.terminalFencesReady
        && activeCall?.accountId === accountId
        && activeCall.callId === callId
        && activeCall.generation === generation
        && !state.isTerminalCallFenced(callId, generation);
    } catch {
      return false;
    }
  }, [accountId, callId, generation]);

  const mayDispatchTermination = useCallback(async () => {
    const synchronized = await useCallStore.getState()
      .synchronizeTerminalCallFences(accountId, generation);
    return synchronized && isTerminalDispatchCurrent();
  }, [accountId, generation, isTerminalDispatchCurrent]);

  const requestTermination = useCallback(() => {
    if (mountedRef.current) setIsEnding(true);
    return commandQueue.requestTermination(() => {
      if (!isTerminalDispatchCurrent()) return [];
      const capability = capabilityRef.current;
      if (!capability) {
        if (direction !== "outgoing") return [];
        return [{
          version: 1,
          type: "recover-cancel",
          commandId: crypto.randomUUID(),
          inviteCommandId: initCommandId,
          callId,
        }];
      }
      const current = useCallStore.getState().activeCall;
      const status = current?.callId === callId && current.generation === generation
        ? current.status
        : latestStatusRef.current;
      const base = {
        version: 1 as const,
        callId,
        capability,
      };
      return callTerminalCommandTypes(direction, status).map((type): CallSignalCommand =>
        type === "reject"
          ? { ...base, type, commandId: crypto.randomUUID(), reason: "declined" }
          : { ...base, type, commandId: crypto.randomUUID() }
      );
    }, {
      isCurrent: isCurrentCall,
      isAuthorityCurrent: isTerminalDispatchCurrent,
      mayDispatch: () => mayDispatchTermination(),
      observeAck: (acknowledgement, _command, commitToCurrentStore) => {
        observeAck(
          acknowledgement.capability,
          acknowledgement.acceptedSequence,
          commitToCurrentStore,
        );
      },
      onTerminated: (_acknowledgement, _command, wasCurrent) => {
        terminalSettledRef.current = true;
        cleanup();
        if (wasCurrent) useCallStore.getState().clearCall(callId, generation);
        if (mountedRef.current) setIsEnding(false);
      },
      onTerminationStale: () => {
        terminalSettledRef.current = true;
        cleanup();
        if (isCurrentCall()) useCallStore.getState().clearCall(callId, generation);
        if (mountedRef.current) setIsEnding(false);
      },
      onTerminationError: (error) => {
        console.error("Call terminal recovery failed", {
          callId,
          threadId,
          accountId,
          error,
        });
        if (isCurrentCall()) {
          if (mountedRef.current) {
            setIsEnding(false);
            setPermissionError("Could not end the call session. Check your connection and retry.");
          }
          setScopedStatus("failed");
          cleanup();
        }
      },
    });
  }, [accountId, callId, cleanup, commandQueue, direction, generation, initCommandId, isCurrentCall, isTerminalDispatchCurrent, mayDispatchTermination, observeAck, setScopedStatus, threadId]);

  const flushIceQueue = useCallback(async (connection: RTCPeerConnection) => {
    const queued = iceQueueRef.current.splice(0);
    await Promise.all(queued.map((candidate) =>
      connection.addIceCandidate(new RTCIceCandidate(candidate))
    ));
  }, []);

  // Media acquisition and route-mediated signaling are effect-owned and every
  // continuation is fenced by disposed + authenticated call generation checks.
  // react-doctor-disable-next-line no-fetch-in-effect, no-set-state-after-await-in-effect
  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let connection: RTCPeerConnection | null = null;
    let workflowStarted = false;

    const capability = () => {
      if (!capabilityRef.current) throw new Error("Call capability unavailable");
      return capabilityRef.current;
    };

    const submitIce = (candidate: Extract<CallSignalCommand, { type: "ice" }>["candidate"]) => {
      void enqueueCommand(() => ({
        version: 1,
        type: "ice",
        commandId: crypto.randomUUID(),
        callId,
        capability: capability(),
        candidate,
      })).catch(() => failCall("The call lost its signaling connection."));
    };

    const releaseLocalIce = () => {
      localDescriptionCommandQueuedRef.current = true;
      for (const candidate of pendingLocalIceRef.current.splice(0)) submitIce(candidate);
    };

    const processEvent = async (payload: unknown) => {
      if (disposed || !isCurrentCall()) return;
      const parsed = parseScopedCallSignalEvent(payload, {
        accountId,
        threadId,
        callId,
        peerUserId: peer.id,
        capability: capabilityRef.current ?? undefined,
        lastSequence: lastSequenceRef.current,
      });
      if (!parsed.success) return;
      const event: CallSignalEvent = parsed.event;
      capabilityRef.current = event.capability;
      lastSequenceRef.current = event.sequence;
      if (!useCallStore.getState().setCallSession(callId, generation, event.capability, event.sequence)) {
        return;
      }

      const current = pcRef.current;
      if (!current) return;
      switch (event.type) {
        case "accept": {
          if (direction !== "outgoing") return;
          setScopedStatus("connecting");
          const offer = await current.createOffer();
          await current.setLocalDescription(offer);
          const offerCommand = enqueueCommand(() => ({
            version: 1,
            type: "offer",
            commandId: crypto.randomUUID(),
            callId,
            capability: capability(),
            sdp: { type: "offer", sdp: offer.sdp ?? "" },
          }));
          releaseLocalIce();
          await offerCommand;
          return;
        }
        case "offer": {
          if (direction !== "incoming") return;
          await current.setRemoteDescription(new RTCSessionDescription(event.sdp));
          hasRemoteDescriptionRef.current = true;
          await flushIceQueue(current);
          const answer = await current.createAnswer();
          await current.setLocalDescription(answer);
          const answerCommand = enqueueCommand(() => ({
            version: 1,
            type: "answer",
            commandId: crypto.randomUUID(),
            callId,
            capability: capability(),
            sdp: { type: "answer", sdp: answer.sdp ?? "" },
          }));
          releaseLocalIce();
          await answerCommand;
          return;
        }
        case "answer":
          if (direction !== "outgoing") return;
          await current.setRemoteDescription(new RTCSessionDescription(event.sdp));
          hasRemoteDescriptionRef.current = true;
          await flushIceQueue(current);
          return;
        case "ice":
          if (hasRemoteDescriptionRef.current) {
            await current.addIceCandidate(new RTCIceCandidate(event.candidate));
          } else {
            iceQueueRef.current.push(event.candidate);
          }
          return;
        case "end":
        case "reject":
        case "cancel":
          terminalSettledRef.current = true;
          setScopedStatus("ended");
          cleanup();
          useCallStore.getState().clearCall(callId, generation);
          return;
        case "invite":
          return;
      }
    };

    const setup = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        failCall("Camera or microphone access denied. Check your browser settings.");
        return;
      }
      if (disposed || !isCurrentCall()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!disposed) setHasMultipleCameras(devices.filter((device) => device.kind === "videoinput").length > 1);
      } catch {
        // Camera switching remains unavailable if enumeration fails.
      }

      const activeConnection = new RTCPeerConnection({ iceServers: await getIceServers() });
      connection = activeConnection;
      pcRef.current = activeConnection;
      stream.getTracks().forEach((track) => activeConnection.addTrack(track, stream));
      activeConnection.ontrack = (event) => {
        if (!disposed && event.streams[0]) setRemoteStream(event.streams[0]);
      };
      activeConnection.onicecandidate = ({ candidate }) => {
        if (!candidate || disposed) return;
        const serialized = candidate.toJSON();
        if (!serialized.candidate) return;
        const candidateValue = serialized.candidate;
        const normalized = {
          candidate: candidateValue,
          sdpMid: serialized.sdpMid,
          sdpMLineIndex: serialized.sdpMLineIndex,
          usernameFragment: serialized.usernameFragment,
        };
        if (localDescriptionCommandQueuedRef.current) submitIce(normalized);
        else pendingLocalIceRef.current.push(normalized);
      };
      activeConnection.onconnectionstatechange = () => {
        if (disposed) return;
        if (activeConnection.connectionState === "connected") {
          if (disconnectTimeoutRef.current) clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = null;
          setScopedStatus("connected");
          if (!heartbeatIntervalRef.current) {
            heartbeatIntervalRef.current = setInterval(() => {
              void enqueueCommand(() => ({
                version: 1,
                type: "heartbeat",
                commandId: crypto.randomUUID(),
                callId,
                capability: capability(),
              })).catch(() => failCall("The call session could not be renewed."));
            }, HEARTBEAT_INTERVAL_MS);
          }
          return;
        }
        if (activeConnection.connectionState === "failed") {
          failCall("The peer connection failed.");
          return;
        }
        if (activeConnection.connectionState === "disconnected" && !disconnectTimeoutRef.current) {
          disconnectTimeoutRef.current = setTimeout(() => {
            if (pcRef.current?.connectionState === "disconnected") {
              failCall("The peer connection was interrupted.");
            }
          }, DISCONNECT_GRACE_MS);
        }
      };

      const channel = supabase.channel(`call:${threadId}`, {
        config: { private: true, broadcast: { self: false } },
      });
      channelRef.current = channel;
      subscribeToCallChannel(channel, ({ payload }) => {
        eventQueueRef.current = (eventQueueRef.current ?? Promise.resolve())
          .then(() => processEvent(payload))
          .catch(() => failCall("The call received an invalid signaling transition."));
      }, (status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED" && !workflowStarted) {
          workflowStarted = true;
          if (commandQueue.hasTerminalIntent()) return;
          const startWorkflow = async () => {
            if (direction === "incoming") {
              const synchronized = await useCallStore.getState()
                .synchronizeTerminalCallFences(accountId, generation);
              const state = useCallStore.getState();
              if (
                !synchronized
                || state.activeCall?.callId !== callId
                || state.activeCall.generation !== generation
                || state.isTerminalCallFenced(callId, generation)
              ) return;
            }
            const initial = direction === "outgoing"
              ? () => ({
                  version: 1 as const,
                  type: "invite" as const,
                  commandId: initCommandId,
                  callId,
                })
              : () => ({
                  version: 1 as const,
                  type: "accept" as const,
                  commandId: initCommandId,
                  callId,
                  capability: capability(),
                });
            await enqueueCommand(initial);
            if (direction !== "outgoing" || disposed) return;
            ringTimeoutRef.current = setTimeout(() => {
              if (pcRef.current?.connectionState === "connected") return;
              void requestTermination().catch(() => {
                // The queue reports and surfaces terminal recovery failures.
              });
            }, RING_TIMEOUT_MS);
          };
          void startWorkflow().catch(() => failCall("Could not start the call. Check your connection and retry."));
          return;
        }
        if (workflowStarted && (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")) {
          failCall("The call signaling connection was interrupted.");
        }
      });
    };

    void setup().catch(() => failCall("Could not initialize the call."));

    const handleBeforeUnload = () => {
      void requestTermination().catch((error) => {
        console.error("Call unload terminal recovery failed", { callId, threadId, error });
      });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      disposed = true;
      mountedRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (!terminalSettledRef.current && !commandQueue.hasTerminalIntent()) {
        void requestTermination().catch((error) => {
          console.error("Call unmount terminal recovery failed", { callId, threadId, error });
        });
      }
      connection?.close();
      cleanup();
    };
  }, [
    accountId,
    callId,
    cleanup,
    commandQueue,
    direction,
    enqueueCommand,
    failCall,
    flushIceQueue,
    generation,
    isCurrentCall,
    initCommandId,
    peer.id,
    requestTermination,
    setScopedStatus,
    threadId,
  ]);

  const toggleMic = useCallback(() => {
    const enabled = !(localStreamRef.current?.getAudioTracks()[0]?.enabled ?? false);
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    setIsMicMuted(!enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const enabled = !(localStreamRef.current?.getVideoTracks()[0]?.enabled ?? false);
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    setIsCameraOff(!enabled);
  }, []);

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const connection = pcRef.current;
    if (!stream || !connection) return;
    const nextFacing = facingModeRef.current === "user" ? "environment" : "user";
    const replacement = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: nextFacing },
      audio: false,
    });
    const [newTrack] = replacement.getVideoTracks();
    if (!newTrack) return;
    const sender = connection.getSenders().find((candidate) => candidate.track?.kind === "video");
    if (sender) await sender.replaceTrack(newTrack);
    const [oldTrack] = stream.getVideoTracks();
    if (oldTrack) {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    stream.addTrack(newTrack);
    const refreshed = new MediaStream(stream.getTracks());
    localStreamRef.current = refreshed;
    setLocalStream(refreshed);
    facingModeRef.current = nextFacing;
  }, []);

  const endCall = useCallback(() => {
    void requestTermination().catch(() => {
      // The queue reports and surfaces terminal recovery failures.
    });
  }, [requestTermination]);

  return {
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
  };
}
