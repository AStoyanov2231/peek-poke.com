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

export interface AuthRefreshEvent {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Map pin kinds — 'cluster' carries count + childIds instead of a user
export type MapPinKind = 'self' | 'user' | 'friend' | 'bot' | 'highlighted' | 'cluster';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  kind: MapPinKind;
  avatarUrl: string | null;
  initial: string;
  // Index into the shared 6-color palette (mirrors web avatarColor palette)
  colorIndex: number;
  isOnline?: boolean;
  isPending?: boolean;
  // Bot-only: user is within collection range (amber + tappable to collect)
  collectable?: boolean;
  // Cluster-only fields
  isSelected?: boolean;
  count?: number;
  childIds?: string[];
}

export interface SetMapPinsOptions {
  pins: MapPin[];
}

export interface SetMapCameraOptions {
  lat: number;
  lng: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
  animated?: boolean;
  durationMs?: number;
}

export interface SetMapClusterConfigOptions {
  radius: number;
  maxZoom: number;
}

export interface MapCameraChangedEvent {
  lat: number;
  lng: number;
  zoom: number;
  bearing: number;
  pitch: number;
  isUserGesture: boolean;
  /** Exact visible bounds from native Mapbox: [west, south, east, north] */
  bounds?: [number, number, number, number];
}

export interface MapPinTappedEvent {
  id: string;
  kind: MapPinKind;
  childIds?: string[];
}

export interface OAuthCallbackEvent {
  /** Full peekpoke://oauth-callback?code=…&next=… URL from the system browser */
  url: string;
}

export interface PeekPokeBridgePlugin {
  setAuth(options: SetAuthOptions): Promise<void>;
  clearAuth(): Promise<void>;
  getAuth(): Promise<GetAuthResult>;
  setRole(options: { isAdmin: boolean }): Promise<void>;
  /** Report a client-side route change so native can sync tab selection and map visibility. */
  setActiveRoute(options: { route: string }): Promise<void>;
  setTabBadge(options: { tab: string; count: number }): Promise<void>;
  setAppBadge(options: { count: number }): Promise<void>;
  openExternal(options: { url: string }): Promise<void>;
  setMapInteractiveRects(options: { rects: Array<{ x: number; y: number; width: number; height: number }> }): Promise<void>;
  setMapPins(options: SetMapPinsOptions): Promise<void>;
  setMapCamera(options: SetMapCameraOptions): Promise<void>;
  /** Start/stop the slow bearing orbit around the current camera center. */
  setMapOrbit(options: { active: boolean }): Promise<void>;
  setMapClusterConfig(options: SetMapClusterConfigOptions): Promise<void>;
  addListener(eventName: 'navigate', listenerFunc: (data: NavigateEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'appResumed', listenerFunc: (data: AppResumedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'authRefresh', listenerFunc: (data: AuthRefreshEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'mapCameraChanged', listenerFunc: (data: MapCameraChangedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'mapPinTapped', listenerFunc: (data: MapPinTappedEvent) => void): Promise<PluginListenerHandle>;
  /** Tap on empty map area (no pin) — used to clear selections, mirroring web onClick. */
  addListener(eventName: 'mapTapped', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'oauthCallback', listenerFunc: (data: OAuthCallbackEvent) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

class PeekPokeBridgeWeb extends WebPlugin implements PeekPokeBridgePlugin {
  async setAuth(): Promise<void> {}
  async clearAuth(): Promise<void> {}
  async getAuth(): Promise<GetAuthResult> { return {}; }
  async setRole(): Promise<void> {}
  async setActiveRoute(): Promise<void> {}
  async setTabBadge(): Promise<void> {}
  async setAppBadge(): Promise<void> {}
  async openExternal(): Promise<void> {}
  async setMapInteractiveRects(): Promise<void> {}
  async setMapPins(): Promise<void> {}
  async setMapCamera(): Promise<void> {}
  async setMapOrbit(): Promise<void> {}
  async setMapClusterConfig(): Promise<void> {}
}

export const PeekPokeBridge = registerPlugin<PeekPokeBridgePlugin>('PeekPokeBridge', {
  web: () => Promise.resolve(new PeekPokeBridgeWeb()),
});
