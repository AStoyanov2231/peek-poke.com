import {
  currentProfileResponseSchema,
  interestCatalogResponseSchema,
  onboardingCompleteResponseSchema,
  ownerProfilePhotoDeleteResponseSchema,
  ownerProfilePhotoMutationResponseSchemaForStorageOrigin,
  ownerProfilePhotosResponseSchemaForStorageOrigin,
  ownerProfilePatchRequestSchema,
  ownerProfileUpdateResponseSchema,
  profileInterestCreateResponseSchema,
  profileInterestDeleteResponseSchema,
  profileInterestsResponseSchema,
  publicProfileResponseSchemaForTarget,
  type InterestTag,
  type CurrentProfile,
  type OnboardingCompleteResponse,
  type ProfileInterest,
  type OwnerProfilePhoto,
  type OwnerProfilePhotoMutationResponse,
  type OwnerProfilePhotosResponse,
  type OwnerProfilePatchRequest,
  type RoomPublicProfileResponse,
} from "@peekpoke/shared";
import { apiFetch, jsonBody } from "@/lib/api";
import { env } from "@/lib/env";

export type PublicProfileData = RoomPublicProfileResponse;

export function fetchCurrentProfile(): Promise<CurrentProfile> {
  return apiFetch<{ profile: CurrentProfile | null }>("/api/profile", {
    responseSchema: currentProfileResponseSchema,
  }).then(({ profile }) => {
    if (!profile) throw new Error("Profile not found");
    return profile;
  });
}

export function fetchProfilePhotos(): Promise<OwnerProfilePhoto[]> {
  return apiFetch<OwnerProfilePhotosResponse>("/api/profile/photos?limit=100", {
    responseSchema: ownerProfilePhotosResponseSchemaForStorageOrigin(env.supabaseUrl),
  })
    .then(({ photos }) => photos);
}

export function fetchProfileInterests(): Promise<ProfileInterest[]> {
  return apiFetch<{ interests: ProfileInterest[] }>("/api/profile/interests", {
    responseSchema: profileInterestsResponseSchema,
  })
    .then(({ interests }) => interests);
}

export function fetchInterestTags(): Promise<InterestTag[]> {
  return apiFetch<{ tags: InterestTag[] }>("/api/interests", {
    responseSchema: interestCatalogResponseSchema,
  }).then(({ tags }) => tags);
}

export function fetchPublicProfile(userId: string): Promise<PublicProfileData> {
  return apiFetch(`/api/profile/${encodeURIComponent(userId)}?limit=100&surface=rooms`, {
    responseSchema: publicProfileResponseSchemaForTarget(userId, env.supabaseUrl, true),
  });
}

export function updateUsername(username: string): Promise<CurrentProfile> {
  return apiFetch<{ profile: CurrentProfile }>("/api/profile/username", {
    method: "PATCH",
    body: jsonBody({ username }),
    responseSchema: currentProfileResponseSchema,
  }).then(({ profile }) => profile);
}

export function updateProfile(
  updates: OwnerProfilePatchRequest,
  signal?: AbortSignal,
): Promise<CurrentProfile> {
  const canonicalUpdates = ownerProfilePatchRequestSchema.parse(updates);
  return apiFetch<{ profile: CurrentProfile }>("/api/profile", {
    method: "PATCH",
    body: jsonBody(canonicalUpdates),
    responseSchema: ownerProfileUpdateResponseSchema,
    signal,
  }).then(({ profile }) => profile);
}

export function addProfileInterest(tagId: string): Promise<ProfileInterest> {
  return apiFetch<{ interest: ProfileInterest }>("/api/profile/interests", {
    method: "POST",
    body: jsonBody({ tag_id: tagId }),
    responseSchema: profileInterestCreateResponseSchema,
  }).then(({ interest }) => interest);
}

export function deleteProfileInterest(interestId: string): Promise<void> {
  return apiFetch(`/api/profile/interests/${encodeURIComponent(interestId)}`, {
    method: "DELETE",
    responseSchema: profileInterestDeleteResponseSchema,
  }).then(() => undefined);
}

export function completeOnboarding(): Promise<OnboardingCompleteResponse> {
  return apiFetch("/api/profile/complete-onboarding", {
    method: "POST",
    responseSchema: onboardingCompleteResponseSchema,
  });
}

export function uploadProfilePhoto(body: FormData): Promise<OwnerProfilePhoto> {
  return apiFetch<OwnerProfilePhotoMutationResponse>("/api/profile/photos", {
    method: "POST",
    body,
    responseSchema: ownerProfilePhotoMutationResponseSchemaForStorageOrigin(env.supabaseUrl),
  }).then(({ photo }) => photo);
}

export function uploadProfileCover(body: FormData): Promise<OwnerProfilePhoto> {
  return apiFetch<OwnerProfilePhotoMutationResponse>("/api/profile/cover", {
    method: "POST",
    body,
    responseSchema: ownerProfilePhotoMutationResponseSchemaForStorageOrigin(env.supabaseUrl),
  }).then(({ photo }) => photo);
}

export function updateProfilePhoto(
  photoId: string,
  updates: { is_avatar?: boolean; is_private?: boolean }
): Promise<OwnerProfilePhoto> {
  return apiFetch<OwnerProfilePhotoMutationResponse>(
    `/api/profile/photos/${encodeURIComponent(photoId)}`,
    {
      method: "PATCH",
      body: jsonBody(updates),
      responseSchema: ownerProfilePhotoMutationResponseSchemaForStorageOrigin(env.supabaseUrl),
    }
  ).then(({ photo }) => photo);
}

export function deleteProfilePhoto(photoId: string): Promise<void> {
  return apiFetch(`/api/profile/photos/${encodeURIComponent(photoId)}`, {
    method: "DELETE",
    responseSchema: ownerProfilePhotoDeleteResponseSchema,
  }).then(() => undefined);
}
