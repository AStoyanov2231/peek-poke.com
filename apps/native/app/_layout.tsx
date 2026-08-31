import { QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import {
  Stack,
  router,
  useGlobalSearchParams,
  usePathname,
  type ErrorBoundaryProps,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  clearNativeRealtimeAuthSession,
  supabase,
  syncNativeRealtimeAuthSession,
} from "@/lib/supabase";
import { assertNativeEnv, env } from "@/lib/env";
import {
  attachPushNavigation,
  nativePushRegistration,
  registerForPushNotifications,
} from "@/lib/push";
import { useAppStore } from "@/state/app-store";
import { useCallStore } from "@/state/call-store";
import { isUnauthorizedError } from "@/lib/api";
import { BootstrapSplash } from "@/components/bootstrap-splash";
import { useRealtimeUserSync } from "@/hooks/use-realtime-dm";
import { useRealtimeRooms } from "@/hooks/use-realtime-rooms";
import { useIncomingCall } from "@/hooks/use-incoming-call";
import { CallProvider } from "@/components/call-provider";
import { RouteErrorRecovery } from "@/components/error-recovery";
import {
  ensureAuthenticatedProfile,
  fetchBootstrap,
  observeMeetingAuthOwner,
} from "@/data/api";
import { observeReadReceiptAuthOwner } from "@/data/read-receipt";
import { bindNativeQueryLifecycle, clearNativeServerState, nativeQueryClient } from "@/data/query-client";
import { nativeQueryKeys } from "@/data/query-keys";
import { resetFriendMutationAttempts } from "@/data/social/api";
import {
  bindUnauthorizedSessionUiDeactivation,
  isUnauthorizedSessionRecoveryActive,
  recoverUnauthorizedSession,
} from "@/lib/session-recovery";
import {
  authSessionIdentity,
  createAuthBootstrapCoordinator,
  type AuthBootstrapKey,
} from "@/lib/auth-bootstrap";
import { loadBootstrapForCurrentSession } from "@/lib/profile-bootstrap";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorRecovery {...props} />;
}

function routeAfterBootstrap(data: Awaited<ReturnType<typeof fetchBootstrap>>, pendingInvite?: string) {
  if (!data.onboarding_completed) {
    router.replace({ pathname: "/onboarding", params: pendingInvite ? { invite: pendingInvite } : {} });
    return;
  }
  if (pendingInvite) {
    router.replace(`/invite/${pendingInvite}` as never);
    return;
  }
  router.replace("/(app)/map");
}

function authBootstrapKey(session: Session): AuthBootstrapKey {
  return {
    userId: session.user.id,
    sessionIdentity: authSessionIdentity(session.access_token),
  };
}

function sameAuthBootstrapKey(left: AuthBootstrapKey, right: AuthBootstrapKey) {
  return left.userId === right.userId
    && left.sessionIdentity === right.sessionIdentity;
}

function useCallAccountSessionOwner(accountId: string | null) {
  const observedAccountId = useCallStore((state) => state.accountId);
  const terminalFencesReady = useCallStore((state) => state.terminalFencesReady);
  useEffect(() => {
    if (!accountId) return;
    const store = useCallStore.getState();
    store.observeAccount(accountId);
    const generation = useCallStore.getState().generation;
    void useCallStore.getState().hydrateTerminalCallFences(accountId, generation);
  }, [accountId]);
  return Boolean(accountId && observedAccountId === accountId && terminalFencesReady);
}

type BootstrapLoadResult =
  | { status: "ready"; data: Awaited<ReturnType<typeof fetchBootstrap>> }
  | { status: "unauthorized" }
  | { status: "stale" };

export default function RootLayout() {
  return (
    <QueryClientProvider client={nativeQueryClient}>
      <RootLayoutContent />
    </QueryClientProvider>
  );
}

// Root ownership intentionally keeps auth lifecycle, navigation, and the
// bootstrap overlay in one mounted coordinator.
// react-doctor-disable-next-line no-giant-component
function RootLayoutContent() {
  const pathname = usePathname();
  const routeParams = useGlobalSearchParams<{ inviterId?: string | string[]; invite?: string | string[] }>();
  const routeInviter = Array.isArray(routeParams.inviterId) ? routeParams.inviterId[0] : routeParams.inviterId;
  const queryInviter = Array.isArray(routeParams.invite) ? routeParams.invite[0] : routeParams.invite;
  const pendingInvite = pathname.startsWith("/invite/") ? routeInviter : queryInviter;
  const pendingInviteRef = useRef(pendingInvite);
  const isAuthCallback = pathname === "/auth/callback";
  const isPasswordRecovery = pathname === "/auth/reset-password";
  useEffect(() => {
    pendingInviteRef.current = pendingInvite;
  }, [pendingInvite]);
  const [fontsLoaded, fontError] = useFonts({
    "Geist-Regular": require("../assets/fonts/Geist-Regular.ttf"),
    "Geist-Medium": require("../assets/fonts/Geist-Medium.ttf"),
    "Geist-SemiBold": require("../assets/fonts/Geist-SemiBold.ttf"),
    "Geist-Bold": require("../assets/fonts/Geist-Bold.ttf"),
  });
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [bootstrapCoordinator] = useState(createAuthBootstrapCoordinator);
  const reset = useAppStore((state) => state.reset);
  const authGenerationRef = useRef(0);
  const bootstrapUserIdRef = useRef<string | null>(null);
  const bootstrapAttemptIdRef = useRef(0);
  useRealtimeUserSync(authenticatedUserId ?? undefined);
  useRealtimeRooms(authenticatedUserId ?? undefined);
  const callAccountReady = useCallAccountSessionOwner(authenticatedUserId);
  useIncomingCall(callAccountReady ? authenticatedUserId ?? undefined : undefined);

  const handleUnauthorizedSession = useCallback(async () => {
    observeMeetingAuthOwner(null);
    observeReadReceiptAuthOwner(null);
    bootstrapCoordinator.invalidate();
    void nativePushRegistration.invalidate();
    bootstrapUserIdRef.current = null;
    useCallStore.getState().observeAccount(null);
    setAuthenticatedUserId(null);
    await recoverUnauthorizedSession();
    setBootstrapError(null);
    setReady(true);
  }, [bootstrapCoordinator]);

  const bootstrapSignedInUser = useCallback(
    (session: Session) => {
      const key = authBootstrapKey(session);
      observeMeetingAuthOwner(key.userId);
      observeReadReceiptAuthOwner(key.userId);
      nativePushRegistration.observeAuth(key, session.access_token);
      if (!nativePushRegistration.isLatest(key)) {
        void nativePushRegistration.invalidate();
      }
      if (bootstrapUserIdRef.current && bootstrapUserIdRef.current !== key.userId) {
        setAuthenticatedUserId(null);
        resetFriendMutationAttempts();
        clearNativeServerState();
        reset();
      }
      bootstrapUserIdRef.current = key.userId;

      const promise = bootstrapCoordinator.start<BootstrapLoadResult>({
        key,
        load: async (signal) => {
          await syncNativeRealtimeAuthSession(session);
          if (signal.aborted) throw signal.reason;

          const attemptId = ++bootstrapAttemptIdRef.current;
          const attemptQueryKey = [...nativeQueryKeys.bootstrap, "auth", key.userId, attemptId] as const;
          try {
            const data = await loadBootstrapForCurrentSession(key.userId, {
              currentSessionUserId: async () => {
                const { data: current } = await supabase.auth.getSession();
                return current.session?.user.id ?? null;
              },
              ensureProfile: ensureAuthenticatedProfile,
              fetchBootstrap: (requestSignal) => nativeQueryClient.fetchQuery({
                queryKey: attemptQueryKey,
                queryFn: () => fetchBootstrap(requestSignal),
                staleTime: 0,
                gcTime: 0,
              }),
            }, signal);
            if (!data) return { status: "stale" };
            return {
              status: "ready",
              data,
            };
          } catch (error) {
            if (isUnauthorizedError(error)) return { status: "unauthorized" };
            throw error;
          } finally {
            nativeQueryClient.removeQueries({ queryKey: attemptQueryKey, exact: true });
          }
        },
        commit: async (result) => {
          if (result.status === "stale") {
            bootstrapCoordinator.invalidate();
            await nativePushRegistration.invalidate();
            bootstrapUserIdRef.current = null;
            useCallStore.getState().observeAccount(null);
            setAuthenticatedUserId(null);
            resetFriendMutationAttempts();
            clearNativeServerState();
            reset();
            await clearNativeRealtimeAuthSession();
            return;
          }
          if (result.status === "unauthorized") {
            await handleUnauthorizedSession();
            return;
          }

          nativeQueryClient.setQueryData(nativeQueryKeys.bootstrap, result.data);
          routeAfterBootstrap(result.data, pendingInviteRef.current);
          setAuthenticatedUserId(key.userId);
          void nativePushRegistration.start({
            key,
            run: (signal) => registerForPushNotifications(
              {
                signal,
                currentAccessToken: async () => {
                  const { data: current } = await supabase.auth.getSession();
                  if (!current.session) return null;
                  return sameAuthBootstrapKey(authBootstrapKey(current.session), key)
                    ? current.session.access_token
                    : null;
                },
              },
              () => {
                void nativePushRegistration.retryLatestUnless(key);
              },
            ),
            onError: (error) => {
              console.warn("Push registration failed:", error);
            },
          });
        },
      });

      return { key, promise };
    },
    [bootstrapCoordinator, handleUnauthorizedSession, reset]
  );

  const retryBootstrap = useCallback(async () => {
    setBootstrapError(null);
    setReady(false);
    const authGeneration = authGenerationRef.current;
    let key: AuthBootstrapKey | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (authGenerationRef.current !== authGeneration) return;
      if (data.session?.user) {
        const attempt = bootstrapSignedInUser(data.session);
        key = attempt.key;
        await attempt.promise;
      } else {
        nativePushRegistration.clearAuth();
        useCallStore.getState().observeAccount(null);
        const invite = pendingInviteRef.current;
        router.replace({ pathname: "/(auth)/login", params: invite ? { invite } : {} });
      }
    } catch (error) {
      if (
        authGenerationRef.current === authGeneration
        && (!key || bootstrapCoordinator.isLatest(key))
      ) {
        setBootstrapError(error);
      }
    } finally {
      if (
        authGenerationRef.current === authGeneration
        && ((!key && bootstrapUserIdRef.current === null) || (key && bootstrapCoordinator.isLatest(key)))
      ) {
        setReady(true);
      }
    }
  }, [bootstrapCoordinator, bootstrapSignedInUser]);

  const initializeSession = useCallback(async (
    authGeneration: number,
    isDisposed: () => boolean,
  ) => {
    let key: AuthBootstrapKey | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (isDisposed() || authGenerationRef.current !== authGeneration) return;

      if (data.session?.user) {
        nativePushRegistration.observeAuth(
          authBootstrapKey(data.session),
          data.session.access_token,
        );
        if (isPasswordRecovery) {
          await syncNativeRealtimeAuthSession(data.session);
        } else {
          const attempt = bootstrapSignedInUser(data.session);
          key = attempt.key;
          await attempt.promise;
        }
      } else if (!isAuthCallback && !isPasswordRecovery) {
        nativePushRegistration.clearAuth();
        useCallStore.getState().observeAccount(null);
        const invite = pendingInviteRef.current;
        router.replace({ pathname: "/(auth)/login", params: invite ? { invite } : {} });
      }
    } catch (error) {
      if (
        !isDisposed()
        && authGenerationRef.current === authGeneration
        && (!key || bootstrapCoordinator.isLatest(key))
      ) {
        setBootstrapError(error);
      }
    } finally {
      if (
        !isDisposed()
        && authGenerationRef.current === authGeneration
        && (
          (!key && bootstrapUserIdRef.current === null)
          || (key && bootstrapCoordinator.isLatest(key))
        )
      ) {
        setReady(true);
      }
    }
  }, [
    bootstrapCoordinator,
    bootstrapSignedInUser,
    isAuthCallback,
    isPasswordRecovery,
  ]);

  useEffect(() => {
    assertNativeEnv();
    if (__DEV__) {
      console.info(`Native API base URL: ${env.apiBaseUrl}`);
    }
    const detachPushNavigation = attachPushNavigation();
    const detachQueryLifecycle = bindNativeQueryLifecycle();
    const detachUnauthorizedUiDeactivation = bindUnauthorizedSessionUiDeactivation(() => {
      observeMeetingAuthOwner(null);
      observeReadReceiptAuthOwner(null);
      bootstrapCoordinator.invalidate();
      void nativePushRegistration.invalidate();
      bootstrapUserIdRef.current = null;
      useCallStore.getState().observeAccount(null);
      setAuthenticatedUserId(null);
    });
    let disposed = false;
    const initialAuthGeneration = authGenerationRef.current;
    const authChangeTimers = new Set<ReturnType<typeof setTimeout>>();

    const scheduleAuthChange = (callback: () => void) => {
      const timer = setTimeout(() => {
        authChangeTimers.delete(timer);
        callback();
      }, 0);
      authChangeTimers.add(timer);
    };

    void initializeSession(initialAuthGeneration, () => disposed);

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        observeMeetingAuthOwner(null);
        observeReadReceiptAuthOwner(null);
        authGenerationRef.current += 1;
        authChangeTimers.forEach(clearTimeout);
        authChangeTimers.clear();
        bootstrapCoordinator.invalidate();
        void nativePushRegistration.invalidate();
        nativePushRegistration.clearAuth();
        bootstrapUserIdRef.current = null;
        useCallStore.getState().observeAccount(null);
        setAuthenticatedUserId(null);
        setBootstrapError(null);
        setReady(true);
        resetFriendMutationAttempts();
        clearNativeServerState();
        reset();
        void clearNativeRealtimeAuthSession().catch((error) => {
          if (!disposed) console.warn("Realtime sign-out cleanup failed:", error);
        });
        if (!isUnauthorizedSessionRecoveryActive()) {
          router.replace("/(auth)/login");
        }
      }
      if (event === "SIGNED_IN" && session?.user) {
        const eventKey = authBootstrapKey(session);
        observeMeetingAuthOwner(eventKey.userId);
        observeReadReceiptAuthOwner(eventKey.userId);
        nativePushRegistration.observeAuth(eventKey, session.access_token);
        if (isPasswordRecovery) return;
        if (!nativePushRegistration.isLatest(eventKey)) {
          void nativePushRegistration.invalidate();
        }
        if (!bootstrapCoordinator.isLatest(eventKey)) {
          bootstrapCoordinator.invalidate();
          if (bootstrapUserIdRef.current && bootstrapUserIdRef.current !== eventKey.userId) {
            setAuthenticatedUserId(null);
            resetFriendMutationAttempts();
            clearNativeServerState();
            reset();
          }
          bootstrapUserIdRef.current = eventKey.userId;
        }
        authGenerationRef.current += 1;
        const eventAuthGeneration = authGenerationRef.current;
        setReady(false);
        setBootstrapError(null);

        scheduleAuthChange(() => {
          if (disposed || authGenerationRef.current !== eventAuthGeneration) return;
          const attempt = bootstrapSignedInUser(session);
          void attempt.promise
            .catch((error) => {
              if (!disposed && bootstrapCoordinator.isLatest(attempt.key)) {
                setBootstrapError(error);
              }
            })
            .finally(() => {
              if (!disposed && bootstrapCoordinator.isLatest(attempt.key)) {
                setReady(true);
              }
            });
        });
      }
      if (event === "TOKEN_REFRESHED" && session?.user) {
        nativePushRegistration.observeAuth(
          authBootstrapKey(session),
          session.access_token,
        );
        const refreshAuthGeneration = authGenerationRef.current;
        scheduleAuthChange(() => {
          if (disposed || authGenerationRef.current !== refreshAuthGeneration) return;
          void syncNativeRealtimeAuthSession(session).catch((error) => {
            if (!disposed) console.warn("Realtime token refresh failed:", error);
          });
        });
      }
    });

    return () => {
      disposed = true;
      authGenerationRef.current += 1;
      bootstrapCoordinator.invalidate();
      void nativePushRegistration.invalidate();
      nativePushRegistration.clearAuth();
      authChangeTimers.forEach(clearTimeout);
      authChangeTimers.clear();
      detachPushNavigation();
      detachQueryLifecycle();
      detachUnauthorizedUiDeactivation();
      authSub.subscription.unsubscribe();
    };
  }, [
    bootstrapCoordinator,
    bootstrapSignedInUser,
    initializeSession,
    isPasswordRecovery,
    reset,
  ]);

  if (fontError) throw fontError;

  const showBootstrap = !ready || !fontsLoaded || Boolean(bootstrapError);

  return (
    <View style={styles.root}>
      <StatusBar animated style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      <CallProvider />
      {showBootstrap ? (
        <View pointerEvents="auto" style={styles.bootstrapOverlay}>
          <BootstrapSplash error={bootstrapError} onRetry={retryBootstrap} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bootstrapOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
  },
});
