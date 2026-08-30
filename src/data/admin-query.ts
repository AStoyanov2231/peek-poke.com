import type { AdminCoin, PhotoApprovalStatus, Profile, ProfilePhoto } from "@/types/database";
import {
  ApiTransportError,
  moderationPhotoMutationResponseSchema,
  moderationPhotoSchema,
  pageInfoSchema,
  profileCardSchema,
  moderationReportMutationResponseSchemaFor,
  moderationReportsResponseSchema,
  type ModerationReport,
  type ModerationReportAction,
  type ModerationReportStatus,
  type ModerationReportsResponse,
} from "@peekpoke/shared";
import { z } from "zod";
import { fetchContract, fetchJson } from "@/lib/typed-api";

export type ModerationPhotoWithUser = Omit<ProfilePhoto, "url" | "thumbnail_url"> & {
  url: string | null;
  thumbnail_url: string | null;
  user: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
};

export type ModerationPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ReportStatus = ModerationReportStatus;
export type ReportAction = ModerationReportAction;
export type UserReport = ModerationReport;
export type ReportsResponse = ModerationReportsResponse;

const moderationPhotosResponseSchema = z.strictObject({
  photos: z.array(moderationPhotoSchema.safeExtend({
    user: profileCardSchema,
  })),
  pagination: pageInfoSchema,
  legacy_pagination: z.strictObject({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export function fetchAdminCoins(signal?: AbortSignal): Promise<AdminCoin[]> {
  return fetchJson<AdminCoin[]>("/api/admin/coins", { signal });
}

export function fetchModerationPhotos(status: PhotoApprovalStatus, page: number, signal?: AbortSignal) {
  return fetchContract(
    `/api/moderation/photos?status=${status}&page=${page}&limit=20`,
    moderationPhotosResponseSchema,
    { signal },
  ).then((response) => ({
    photos: response.photos as ModerationPhotoWithUser[],
    pagination: response.legacy_pagination,
  }));
}

export function moderateProfilePhoto(photoId: string, action: "approve" | "reject", reason?: string) {
  return fetchContract(
    `/api/moderation/photos/${encodeURIComponent(photoId)}`,
    moderationPhotoMutationResponseSchema,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
    },
  );
}

export function fetchAdminReports(status: ReportStatus, signal?: AbortSignal) {
  return fetchContract(
    `/api/moderation/reports?status=${status}&limit=100`,
    moderationReportsResponseSchema,
    { signal },
  );
}

export function updateAdminReport(
  reportId: string,
  status: ReportAction,
) {
  return fetchContract(
    `/api/moderation/reports/${encodeURIComponent(reportId)}`,
    moderationReportMutationResponseSchemaFor(reportId, status),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
}

export function moderationReportMutationErrorMessage(error: unknown) {
  if (error instanceof ApiTransportError) {
    if (error.code === "INVALID_RESPONSE") {
      return "The server returned an invalid report update. The report remains in this queue.";
    }
    if (error.status === 403) {
      return "You no longer have permission to update this report. The report remains in this queue.";
    }
    if (error.status === 0) {
      return "Network unavailable. The report remains in this queue.";
    }
    if (error.status >= 500) {
      return "The report service is unavailable. The report remains in this queue.";
    }
  }
  return "The report could not be updated. The report remains in this queue.";
}
