export type ApiErrorPayload = {
  error: string;
  message?: string;
  code?: string;
};

export type AuthProfileResponse = import("./contract").CurrentProfileResponse;

export type EntitlementsResponse = {
  subscriber: boolean;
  roles: import("./types").RoleName[];
};

export type NearbyResponse = import("./contract").NearbyResponseDto;

export type PushTokenRequest = {
  token: string;
  platform: import("./types").PushPlatform;
  provider?: import("./types").PushProvider;
};
