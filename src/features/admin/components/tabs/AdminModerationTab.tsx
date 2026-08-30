"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertCircle, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PhotoApprovalStatus } from "@/types/database";
import {
  fetchModerationPhotos,
  moderateProfilePhoto,
  type ModerationPagination as Pagination,
  type ModerationPhotoWithUser as PhotoWithUser,
} from "@/data/admin-query";
import { webQueryKeys } from "@/data/web-query";

function PhotoGrid({
  status,
  onApprove,
  onReject,
}: {
  status: PhotoApprovalStatus;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [viewerPhoto, setViewerPhoto] = useState<PhotoWithUser | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mod-photos", status, page],
    queryFn: ({ signal }) => fetchModerationPhotos(status, page, signal),
    placeholderData: keepPreviousData,
  });

  const photos = data?.photos ?? [];
  const pagination = data?.pagination ?? null;

  const approveMutation = useMutation({
    mutationFn: (photoId: string) => moderateProfilePhoto(photoId, "approve"),
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: ["mod-photos", status, page] });
      const prev = queryClient.getQueryData<{ photos: PhotoWithUser[]; pagination: Pagination }>(["mod-photos", status, page]);
      if (prev) {
        queryClient.setQueryData(["mod-photos", status, page], {
          photos: prev.photos.filter((p) => p.id !== photoId),
          pagination: { ...prev.pagination, total: prev.pagination.total - 1 },
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["mod-photos", status, page], ctx.prev);
    },
    onSuccess: (response) => Promise.all([
      queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(response.photo.user_id) }),
      queryClient.invalidateQueries({ queryKey: ["web", "nearby"] }),
    ]),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["mod-photos", "pending"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ photoId, reason }: { photoId: string; reason: string }) =>
      moderateProfilePhoto(photoId, "reject", reason),
    onSuccess: (response) => Promise.all([
      queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(response.photo.user_id) }),
      queryClient.invalidateQueries({ queryKey: ["web", "nearby"] }),
    ]),
    onMutate: async ({ photoId }) => {
      await queryClient.cancelQueries({ queryKey: ["mod-photos", status, page] });
      const prev = queryClient.getQueryData<{ photos: PhotoWithUser[]; pagination: Pagination }>(["mod-photos", status, page]);
      if (prev) {
        queryClient.setQueryData(["mod-photos", status, page], {
          photos: prev.photos.filter((p) => p.id !== photoId),
          pagination: { ...prev.pagination, total: prev.pagination.total - 1 },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["mod-photos", status, page], ctx.prev);
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
        <p>Failed to load photos</p>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
        <p>No {status} photos</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {photos.map((photo) => {
          const isActing =
            (approveMutation.isPending && approveMutation.variables === photo.id) ||
            (rejectMutation.isPending && rejectMutation.variables?.photoId === photo.id);
          return (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-xl overflow-hidden bg-muted cursor-pointer"
            >
              <button
                type="button"
                className="absolute inset-0"
                aria-label="View photo"
                disabled={!photo.url}
                onClick={() => setViewerPhoto(photo)}
              >
                {photo.url ? (
                  <Image src={photo.url} alt="" fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-muted-foreground">Media removed</span>
                )}
              </button>

              {/* User badge */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5 flex-shrink-0">
                    <AvatarImage src={photo.user.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{photo.user.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-white text-xs truncate">{photo.user.display_name || photo.user.username}</span>
                </div>
              </div>

              {/* Pending actions */}
              {status === "pending" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isActing ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <>
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); approveMutation.mutate(photo.id); }}
                        aria-label="Approve photo"
                        className="w-9 h-9 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow transition-colors"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); onReject(photo.id); }}
                        aria-label="Reject photo"
                        className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Rejected reason badge */}
              {status === "rejected" && (photo as PhotoWithUser & { rejection_reason?: string }).rejection_reason && (
                <div className="absolute top-1.5 left-1.5">
                  <Badge variant="destructive" className="text-xs">Rejected</Badge>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {pagination.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Full-screen viewer */}
      <Dialog open={!!viewerPhoto} onOpenChange={(open) => !open && setViewerPhoto(null)}>
        <DialogContent className="max-w-3xl p-0 bg-black/95 border-none">
          <button type="button"
            onClick={() => setViewerPhoto(null)}
            aria-label="Close photo viewer"
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center justify-center min-h-[60vh] p-6">
            {viewerPhoto?.url && (
              <Image src={viewerPhoto.url} alt="" width={1200} height={900} className="max-w-full max-h-[75vh] object-contain" />
            )}
          </div>
          {viewerPhoto && status === "pending" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
              <Button
                size="sm"
                className="bg-green-500 hover:bg-green-600 text-white"
                onClick={() => { approveMutation.mutate(viewerPhoto.id); setViewerPhoto(null); }}
              >
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { setViewerPhoto(null); onReject(viewerPhoto.id); }}
              >
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminModerationTab() {
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<PhotoApprovalStatus>("pending");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const rejectingPhotoId = useRef<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: pendingData } = useQuery({
    queryKey: ["mod-photos", "pending", 1],
    queryFn: ({ signal }) => fetchModerationPhotos("pending", 1, signal),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ photoId, reason }: { photoId: string; reason: string }) =>
      moderateProfilePhoto(photoId, "reject", reason),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["mod-photos"] });
      queryClient.invalidateQueries({ queryKey: webQueryKeys.publicProfile(response.photo.user_id) });
      queryClient.invalidateQueries({ queryKey: ["web", "nearby"] });
      setRejectDialogOpen(false);
      rejectingPhotoId.current = null;
      setRejectionReason("");
    },
  });

  const openRejectDialog = (photoId: string) => {
    rejectingPhotoId.current = photoId;
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const prefetch = (s: PhotoApprovalStatus) => {
    queryClient.prefetchQuery({
      queryKey: ["mod-photos", s, 1],
      queryFn: ({ signal }) => fetchModerationPhotos(s, 1, signal),
    });
  };

  return (
    <div>
      <Tabs value={activeStatus} onValueChange={(v) => { setActiveStatus(v as PhotoApprovalStatus); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending" onMouseEnter={() => prefetch("pending")}>
            Pending
            {pendingData?.pagination?.total ? (
              <Badge variant="secondary" className="ml-2">{pendingData.pagination.total}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="approved" onMouseEnter={() => prefetch("approved")}>Approved</TabsTrigger>
          <TabsTrigger value="rejected" onMouseEnter={() => prefetch("rejected")}>Rejected</TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected"] as PhotoApprovalStatus[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-0">
            <PhotoGrid status={s} onApprove={() => {}} onReject={openRejectDialog} />
          </TabsContent>
        ))}
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Photo</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              onClick={() => rejectingPhotoId.current && rejectMutation.mutate({ photoId: rejectingPhotoId.current, reason: rejectionReason.trim() })}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
