import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { apiFetch, jsonBody } from "./api";
import { resolveNotificationRoute } from "./navigation-policy";
import {
  createAuthScopedPushRegistrationCoordinator,
  registerPushForCurrentAuth,
  unregisterPushForCapturedAuth,
  type CapturedPushAuth,
  type CurrentPushAuthScope,
} from "./push-registration";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function expoProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId;
}

export const nativePushRegistration = createAuthScopedPushRegistrationCoordinator();

export function captureCurrentPushAuth() {
  return nativePushRegistration.captureAuth();
}

export function registerForPushNotifications(
  scope: CurrentPushAuthScope,
  onCompensationSettled?: () => void,
) {
  const projectId = expoProjectId();
  return registerPushForCurrentAuth(scope, {
    isDevice: Device.isDevice,
    getPermission: async () => (await Notifications.getPermissionsAsync()).status,
    requestPermission: async () => (await Notifications.requestPermissionsAsync()).status,
    acquireDeviceToken: async () => (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data,
    registerToken: async (token, accessToken, signal) => {
      await apiFetch("/api/profile/push-token", {
        method: "POST",
        body: jsonBody({
          token,
          provider: "expo",
          platform: Platform.OS === "ios" ? "ios" : "android",
        }),
        authToken: accessToken,
        signal,
      });
    },
    revokeToken: async (token, accessToken, signal) => {
      await apiFetch("/api/profile/push-token", {
        method: "DELETE",
        body: jsonBody({ token }),
        authToken: accessToken,
        signal,
      });
    },
    reportCompensationError: (error) => {
      console.warn("Stale push registration cleanup failed:", error);
    },
    onCompensationSettled,
  });
}

export function unregisterForPushNotifications(auth: CapturedPushAuth | null) {
  const projectId = expoProjectId();
  return nativePushRegistration.unregister({
    auth,
    run: async (capturedAuth, isCurrent) => {
      const token = await unregisterPushForCapturedAuth(capturedAuth, isCurrent, {
        isDevice: Device.isDevice,
        getPermission: async () => (await Notifications.getPermissionsAsync()).status,
        acquireDeviceToken: async () => (
          await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
        ).data,
        revokeToken: async (deviceToken, accessToken, signal) => {
          await apiFetch("/api/profile/push-token", {
            method: "DELETE",
            body: jsonBody({ token: deviceToken }),
            authToken: accessToken,
            signal,
          });
        },
      });
      if (token && isCurrent()) {
        void Notifications.dismissAllNotificationsAsync().catch((error) => {
          console.warn("Push notification dismissal failed:", error);
        });
      }
    },
    onError: (error) => {
      console.warn("Push token unregister failed:", error);
    },
  });
}

export function attachPushNavigation() {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = resolveNotificationRoute(response.notification.request.content.data?.route);
    if (route) {
      router.push(route as never);
    }
  });

  return () => subscription.remove();
}
