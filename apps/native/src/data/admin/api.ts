import {
  moderationPhotoSchema,
  moderationPhotoMutationResponseSchema,
  moderationReportMutationResponseSchemaFor,
  moderationReportsResponseSchema,
  pageInfoSchema,
  type ModerationPhoto,
  type ModerationReport,
  type ModerationReportAction,
  type PageInfo,
} from "@peekpoke/shared";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, jsonBody } from "@/lib/api";
import { nativeQueryKeys } from "@/data/query-keys";

export const ADMIN_PAGE_LIMIT = 20;

export type PhotoApprovalStatus = ModerationPhoto["approval_status"];
export type ReportStatus = ModerationReport["status"];

export type AdminPage<T> = {
  items: T[];
  page: PageInfo;
  total?: number;
};

export type AdminCoin = {
  id: string;
  lat: number;
  lng: number;
  created_at: string;
};

const legacyPaginationSchema = z.looseObject({
  total: z.number().int().nonnegative(),
});

const moderationPhotosResponseSchema = z.object({
  photos: z.array(moderationPhotoSchema),
  pagination: pageInfoSchema,
  legacy_pagination: legacyPaginationSchema.optional(),
});

const adminCoinSchema = z.object({
  id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  created_at: z.string().min(1),
});

const adminCoinsSchema = z.array(adminCoinSchema);

function listPath(path: string, status: string, cursor: string | null) {
  const query = [`status=${encodeURIComponent(status)}`, `limit=${ADMIN_PAGE_LIMIT}`];
  if (cursor) query.push(`cursor=${encodeURIComponent(cursor)}`);
  return `${path}?${query.join("&")}`;
}

export function hasAdminRole(roles: readonly string[] | null | undefined) {
  return roles?.includes("admin") ?? false;
}

export function moderationPhotosPath(status: PhotoApprovalStatus, cursor: string | null) {
  return listPath("/api/moderation/photos", status, cursor);
}

export function moderationReportsPath(status: ReportStatus, cursor: string | null) {
  return listPath("/api/moderation/reports", status, cursor);
}

export async function fetchModerationPhotos(
  status: PhotoApprovalStatus,
  cursor: string | null,
): Promise<AdminPage<ModerationPhoto>> {
  const response = await apiFetch<z.infer<typeof moderationPhotosResponseSchema>>(
    moderationPhotosPath(status, cursor),
    {
    responseSchema: moderationPhotosResponseSchema,
    },
  );
  return {
    items: response.photos,
    page: response.pagination,
    total: response.legacy_pagination?.total,
  };
}

export async function fetchModerationReports(
  status: ReportStatus,
  cursor: string | null,
): Promise<AdminPage<ModerationReport>> {
  const response = await apiFetch<z.infer<typeof moderationReportsResponseSchema>>(
    moderationReportsPath(status, cursor),
    {
    responseSchema: moderationReportsResponseSchema,
    },
  );
  return {
    items: response.reports,
    page: response.pagination,
    total: response.legacy_pagination?.total,
  };
}

export function fetchAdminCoins(): Promise<AdminCoin[]> {
  return apiFetch<AdminCoin[]>("/api/admin/coins", { responseSchema: adminCoinsSchema });
}

export function moderatePhoto(
  photoId: string,
  action: "approve" | "reject",
  reason?: string,
) {
  return apiFetch<{ photo: ModerationPhoto }>(`/api/moderation/photos/${encodeURIComponent(photoId)}`, {
    method: "PATCH",
    body: jsonBody(action === "reject" ? { action, reason } : { action }),
    responseSchema: moderationPhotoMutationResponseSchema,
  });
}

export function updateReport(
  reportId: string,
  status: ModerationReportAction,
) {
  return apiFetch(`/api/moderation/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    body: jsonBody({ status }),
    responseSchema: moderationReportMutationResponseSchemaFor(reportId, status),
  });
}

export function placeAdminCoin(lat: number, lng: number): Promise<AdminCoin> {
  return apiFetch<AdminCoin>("/api/admin/coins", {
    method: "POST",
    body: jsonBody({ lat, lng }),
    responseSchema: adminCoinSchema,
  });
}

export function deleteAdminCoin(coinId: string) {
  return apiFetch(`/api/admin/coins/${encodeURIComponent(coinId)}`, { method: "DELETE" });
}

export const adminQueryOptions = {
  photos: (status: PhotoApprovalStatus, cursor: string | null) => queryOptions({
    queryKey: nativeQueryKeys.admin.photos(status, cursor),
    queryFn: () => fetchModerationPhotos(status, cursor),
  }),
  reports: (status: ReportStatus, cursor: string | null) => queryOptions({
    queryKey: nativeQueryKeys.admin.reports(status, cursor),
    queryFn: () => fetchModerationReports(status, cursor),
  }),
  coins: () => queryOptions({
    queryKey: nativeQueryKeys.admin.coins,
    queryFn: fetchAdminCoins,
  }),
};
