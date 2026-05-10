import { registerPlugin, WebPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SetAuthOptions {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface GetAuthResult {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface NavigateEvent {
  route: string;
  source: 'tab' | 'deeplink' | 'map';
}

export interface AppResumedEvent {
  route: string;
}

export interface RefreshNeededEvent {
  reason: string;
}

export interface PushReceivedEvent {
  data: Record<string, unknown>;
}

export interface AuthRefreshEvent {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface PeekPokeBridgePlugin {
  setAuth(options: SetAuthOptions): Promise<void>;
  clearAuth(): Promise<void>;
  getAuth(): Promise<GetAuthResult>;
  setRole(options: { isAdmin: boolean }): Promise<void>;
  setTabBadge(options: { tab: string; count: number }): Promise<void>;
  setAppBadge(options: { count: number }): Promise<void>;
  notifyReady(options?: { route?: string }): Promise<void>;
  setLastRoute(options: { tab: string; route: string }): Promise<void>;
  openExternal(options: { url: string }): Promise<void>;
  requestPushPermission(): Promise<void>;
  addListener(eventName: 'navigate', listenerFunc: (data: NavigateEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'appResumed', listenerFunc: (data: AppResumedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'refreshNeeded', listenerFunc: (data: RefreshNeededEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'pushReceived', listenerFunc: (data: PushReceivedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'authRefresh', listenerFunc: (data: AuthRefreshEvent) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

class PeekPokeBridgeWeb extends WebPlugin implements PeekPokeBridgePlugin {
  async setAuth(): Promise<void> {}
  async clearAuth(): Promise<void> {}
  async getAuth(): Promise<GetAuthResult> { return {}; }
  async setRole(): Promise<void> {}
  async setTabBadge(): Promise<void> {}
  async setAppBadge(): Promise<void> {}
  async notifyReady(): Promise<void> {}
  async setLastRoute(): Promise<void> {}
  async openExternal(): Promise<void> {}
  async requestPushPermission(): Promise<void> {}
}

export const PeekPokeBridge = registerPlugin<PeekPokeBridgePlugin>('PeekPokeBridge', {
  web: () => Promise.resolve(new PeekPokeBridgeWeb()),
});
