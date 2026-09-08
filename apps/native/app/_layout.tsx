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
import type { AgeAdmission } from "@peekpoke/shared";
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
import { inviteTokenForReturn } from "@/lib/invite-qr-link";
import { isPublicPlanPreviewPath, loginRouteForPendingIntent, routeAfterBootstrap } from "@/lib/auth-return-navigation";
import { AgeAdmissionProvider } from "@/components/age-admission-context";
import {
  ageAdmissionReturnIntent,
  canRefreshAdultRealtimeSession,
  canStartAgeRestrictedServices,
  requiresAgeAdmissionRoute,
} from "@/lib/age-admission-navigation";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorRecovery {...props} />;
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
  const currentPathnameRef = useRef(pathname);
  useEffect(() => {
    currentPathnameRef.current = pathname;
  }, [pathname]);
  const routeParams = useGlobalSearchParams<{ inviterId?: string | string[]; invite?: string | string[]; plan_token?: string | string[]; token?: string | string[] }>();
  const routeInviter = Array.isArray(routeParams.inviterId) ? routeParams.inviterId[0] : routeParams.inviterId;
  const queryInviter = Array.isArray(routeParams.invite) ? routeParams.invite[0] : routeParams.invite;
  const queryPlanToken = Array.isArray(routeParams.plan_token) ? routeParams.plan_token[0] : routeParams.plan_token;
  const routePlanToken = Array.isArray(routeParams.token) ? routeParams.token[0] : routeParams.token;
  const rawPendingInvite = pathname.startsWith("/invite/") ? routeInviter : queryInviter;
  const rawPlanToken = pathname.startsWith("/plan/") ? routePlanToken : queryPlanToken;
  const pendingInvite = inviteTokenForReturn(rawPendingInvite);
  const pendingPlanToken = typeof rawPlanToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(rawPlanToken) ? rawPlanToken : undefined;
  const pendingInviteRef = useRef(pendingInvite);
  const pendingPlanTokenRef = useRef(pendingPlanToken);
  const isAuthCallback = pathname === "/auth/callback";
  const isPasswordRecovery = pathname === "/auth/reset-password";
  useEffect(() => {
    pendingInviteRef.current = pendingInvite;
  }, [pendingInvite]);
  useEffect(() => {
    pendingPlanTokenRef.current = pendingPlanToken;
  }, [pendingPlanToken]);
  const [fontsLoaded, fontError] = useFonts({
    "Geist-Regular": require("../assets/fonts/Geist-Regular.ttf"),
    "Geist-Medium": require("../assets/fonts/Geist-Medium.ttf"),
    "Geist-SemiBold": require("../assets/fonts/Geist-SemiBold.ttf"),
    "Geist-Bold": require("../assets/fonts/Geist-Bold.ttf"),
  });
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [ageAdmission, setAgeAdmission] = useState<AgeAdmission | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [bootstrapCoordinator] = useState(createAuthBootstrapCoordinator);
  const reset = useAppStore((state) => state.reset);
  const authGenerationRef = useRef(0);
  const bootstrapUserIdRef = useRef<string | null>(null);
  const bootstrapAttemptIdRef = useRef(0);
  const ageAdmissionRef = useRef<AgeAdmission | null>(null);
  const updateAgeAdmission = useCallback((next: AgeAdmission | null) => {
    ageAdmissionRef.current = next;
    setAgeAdmission(next);
  }, []);
  useRealtimeUserSync(authenticatedUserId ?? undefined);
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
    setSessionUserId(null);
    setSessionResolved(true);
    updateAgeAdmission(null);
    await recoverUnauthorizedSession();
    setBootstrapError(null);
    setReady(true);
  }, [bootstrapCoordinator, updateAgeAdmission]);

  const bootstrapSignedInUser = useCallback(
    (session: Session) => {
      const key = authBootstrapKey(session);
      observeMeetingAuthOwner(key.userId);
      observeReadReceiptAuthOwner(key.userId);
      if (bootstrapUserIdRef.current && bootstrapUserIdRef.current !== key.userId) {
        setAuthenticatedUserId(null);
        updateAgeAdmission(null);
        resetFriendMutationAttempts();
        clearNativeServerState();
        reset();
      }
      bootstrapUserIdRef.current = key.userId;

      const promise = bootstrapCoordinator.start<BootstrapLoadResult>({
        key,
        load: async (signal) => {
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
            updateAgeAdmission(null);
            resetFriendMutationAttempts();
            clearNativeServerState();
            reset();
            await recoverUnauthorizedSession();
            return;
          }
          if (result.status === "unauthorized") {
            await handleUnauthorizedSession();
            return;
          }

          nativeQueryClient.setQueryData(nativeQueryKeys.bootstrap, result.data);
          updateAgeAdmission(result.data.age_admission);
          if (!isPublicPlanPreviewPath(currentPathnameRef.current)) {
            router.replace(routeAfterBootstrap(result.data, pendingInviteRef.current, pendingPlanTokenRef.current) as never);
          }
          if (result.data.age_admission.status !== "adult") return;
          await syncNativeRealtimeAuthSession(session);
          if (!canStartAgeRestrictedServices({
            admission: result.data.age_admission,
            candidateUserId: key.userId,
            currentBootstrapUserId: bootstrapUserIdRef.current,
            latestBootstrap: bootstrapCoordinator.isLatest(key),
          })) return;
          nativePushRegistration.observeAuth(key, session.access_token);
          if (!nativePushRegistration.isLatest(key)) {
            void nativePushRegistration.invalidate();
          }
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
    [bootstrapCoordinator, handleUnauthorizedSession, reset, updateAgeAdmission]
  );

  const refreshAdmission = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    bootstrapCoordinator.invalidate();
    setBootstrapError(null);
    setReady(false);
    try {
      await bootstrapSignedInUser(data.session).promise;
    } catch (error) {
      setBootstrapError(error);
    } finally {
      setReady(true);
    }
  }, [bootstrapCoordinator, bootstrapSignedInUser]);

  useEffect(() => {
    if (!ready || !requiresAgeAdmissionRoute(pathname, ageAdmission, isPublicPlanPreviewPath(pathname))) return;
    router.replace({
      pathname: "/age-admission",
      params: ageAdmissionReturnIntent(pendingInviteRef.current, pendingPlanTokenRef.current),
    });
  }, [ageAdmission, pathname, pendingPlanToken, ready]);

  useEffect(() => {
    if (!ready || !sessionResolved || sessionUserId || !pendingInvite || !pathname.startsWith("/invite/")) return;
    router.replace(loginRouteForPendingIntent(pendingInvite));
  }, [ready, sessionResolved, sessionUserId, pendingInvite, pathname]);

  const retryBootstrap = useCallback(async () => {
    setBootstrapError(null);
    setReady(false);
    const authGeneration = authGenerationRef.current;
    let key: AuthBootstrapKey | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (authGenerationRef.current !== authGeneration) return;
      if (data.session?.user) {
        observeMeetingAuthOwner(data.session.user.id);
        observeReadReceiptAuthOwner(data.session.user.id);
        setSessionUserId(data.session.user.id);
        setSessionResolved(false);
        const attempt = bootstrapSignedInUser(data.session);
        key = attempt.key;
        await attempt.promise;
      } else {
        nativePushRegistration.clearAuth();
        useCallStore.getState().observeAccount(null);
        setSessionUserId(null);
        setSessionResolved(true);
        const invite = pendingInviteRef.current;
        if (!isPublicPlanPreviewPath(currentPathnameRef.current)) {
          router.replace(loginRouteForPendingIntent(invite, pendingPlanTokenRef.current));
        }
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
        setSessionResolved(true);
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
        observeMeetingAuthOwner(data.session.user.id);
        observeReadReceiptAuthOwner(data.session.user.id);
        setSessionUserId(data.session.user.id);
        if (!isPasswordRecovery) {
          const attempt = bootstrapSignedInUser(data.session);
          key = attempt.key;
          await attempt.promise;
        }
      } else if (!isAuthCallback && !isPasswordRecovery) {
        nativePushRegistration.clearAuth();
        useCallStore.getState().observeAccount(null);
        const invite = pendingInviteRef.current;
        if (!isPublicPlanPreviewPath(currentPathnameRef.current)) {
          router.replace(loginRouteForPendingIntent(invite, pendingPlanTokenRef.current));
        }
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
        setSessionResolved(true);
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
      setSessionUserId(null);
      setSessionResolved(true);
      updateAgeAdmission(null);
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
        setSessionUserId(null);
        setSessionResolved(true);
        updateAgeAdmission(null);
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
        setSessionUserId(eventKey.userId);
        setSessionResolved(false);
        if (isPasswordRecovery) return;
        if (!bootstrapCoordinator.isLatest(eventKey)) {
          bootstrapCoordinator.invalidate();
          if (bootstrapUserIdRef.current && bootstrapUserIdRef.current !== eventKey.userId) {
            setAuthenticatedUserId(null);
            updateAgeAdmission(null);
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
        if (!canRefreshAdultRealtimeSession(ageAdmissionRef.current)) return;
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
    updateAgeAdmission,
  ]);

  if (fontError) throw fontError;

  const showBootstrap = !ready || !fontsLoaded || Boolean(bootstrapError);
  const canMountAuthenticatedRoutes = ageAdmission?.status === "adult";
  const canMountAgeAdmission = sessionResolved && Boolean(sessionUserId) && !canMountAuthenticatedRoutes;

  return (
    <View style={styles.root}>
      <StatusBar animated style="dark" />
      <AgeAdmissionProvider value={{ accountId: sessionUserId, admission: ageAdmission, refreshAdmission }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/welcome" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="auth/reset-password" />
          <Stack.Protected guard={canMountAgeAdmission}>
            <Stack.Screen name="age-admission" />
          </Stack.Protected>
          <Stack.Protected guard={canMountAuthenticatedRoutes}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="chat/[threadId]" />
            <Stack.Screen name="group/[groupId]" />
            <Stack.Screen name="plans/[planId]" />
          </Stack.Protected>
          {/* Public previews must survive cold-start session hydration. Joining
              still performs its own session and age-admission checks. */}
          <Stack.Screen name="plan/[token]" />
          {/* Preserve the invitation token while its screen withholds Connect
              until adult admission and bootstrap routing are resolved. */}
          <Stack.Screen name="invite/[inviterId]" />
        </Stack>
        <CallProvider />
      </AgeAdmissionProvider>
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
