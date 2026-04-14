"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, AlertCircle, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PhotoReviewCard } from "@/components/moderation/PhotoReviewCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProfilePhoto, Profile, PhotoApprovalStatus } from "@/types/database";

type PhotoWithUser = ProfilePhoto & {
  user: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
  reviewer?: Pick<Profile, "id" | "username" | "display_name"> | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

async function fetchModerationPhotos(status: PhotoApprovalStatus, page: number) {
  const res = await fetch(`/api/moderation/photos?status=${status}&page=${page}&limit=20`);
  if (!res.ok) throw new Error("Failed to fetch photos");
  return res.json() as Promise<{ photos: PhotoWithUser[]; pagination: Pagination }>;
}

export function ModerationPageClient() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PhotoApprovalStatus>("pending");
  const [page, setPage] = useState(1);

  // Rejection dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingPhotoId, setRejectingPhotoId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Photo viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["moderation-photos", status, page],
    queryFn: () => fetchModerationPhotos(status, page),
    placeholderData: keepPreviousData,
  });

  const photos = data?.photos ?? [];
  const pagination = data?.pagination ?? null;

  const approveMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const res = await fetch(`/api/moderation/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error("Failed to approve photo");
    },
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: ["moderation-photos", status, page] });
      const prev = queryClient.getQueryData<{ photos: PhotoWithUser[]; pagination: Pagination }>(["moderation-photos", status, page]);
      if (prev) {
        queryClient.setQueryData(["moderation-photos", status, page], {
          photos: prev.photos.filter((p) => p.id !== photoId),
          pagination: { ...prev.pagination, total: prev.pagination.total - 1 },
        });
      }
      return { prev };
    },
    onError: (_err, _photoId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["moderation-photos", status, page], context.prev);
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ photoId, reason }: { photoId: string; reason: string }) => {
      const res = await fetch(`/api/moderation/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      if (!res.ok) throw new Error("Failed to reject photo");
    },
    onMutate: async ({ photoId }) => {
      await queryClient.cancelQueries({ queryKey: ["moderation-photos", status, page] });
      const prev = queryClient.getQueryData<{ photos: PhotoWithUser[]; pagination: Pagination }>(["moderation-photos", status, page]);
      if (prev) {
        queryClient.setQueryData(["moderation-photos", status, page], {
          photos: prev.photos.filter((p) => p.id !== photoId),
          pagination: { ...prev.pagination, total: prev.pagination.total - 1 },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["moderation-photos", status, page], context.prev);
      }
    },
  });

  const handleApprove = (photoId: string) => approveMutation.mutate(photoId);

  const openRejectDialog = (photoId: string) => {
    setRejectingPhotoId(photoId);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = () => {
    if (!rejectingPhotoId || !rejectionReason.trim()) return;
    rejectMutation.mutate({ photoId: rejectingPhotoId, reason: rejectionReason.trim() });
    setRejectDialogOpen(false);
  };

  const isActionLoading = (photoId: string) =>
    (approveMutation.isPending && approveMutation.variables === photoId) ||
    (rejectMutation.isPending && rejectMutation.variables?.photoId === photoId);

  const openViewer = (index: number) => {
    setCurrentIndex(index);
    setViewerOpen(true);
  };

  const nextPhoto = () => {
    if (photos.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    if (photos.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleTabChange = (v: string) => {
    setStatus(v as PhotoApprovalStatus);
    setPage(1);
  };

  const prefetchTab = (tabStatus: PhotoApprovalStatus) => {
    queryClient.prefetchQuery({
      queryKey: ["moderation-photos", tabStatus, 1],
      queryFn: () => fetchModerationPhotos(tabStatus, 1),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Photo Moderation</h1>
          <p className="text-muted-foreground">Review and approve user photos</p>
        </div>

        <Tabs value={status} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending" onMouseEnter={() => prefetchTab("pending")}>
              Pending
              {status === "pending" && pagination?.total ? (
                <Badge variant="secondary" className="ml-2">
                  {pagination.total}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="approved" onMouseEnter={() => prefetchTab("approved")}>Approved</TabsTrigger>
            <TabsTrigger value="rejected" onMouseEnter={() => prefetchTab("rejected")}>Rejected</TabsTrigger>
          </TabsList>

          <TabsContent value={status} className="mt-0">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p>No {status} photos</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {photos.map((photo, index) => (
                    <PhotoReviewCard
                      key={photo.id}
                      photo={photo}
                      index={index}
                      status={status}
                      isActionLoading={isActionLoading(photo.id)}
                      onOpenViewer={openViewer}
                      onApprove={handleApprove}
                      onOpenRejectDialog={openRejectDialog}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Rejection Dialog */}
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
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <button
            onClick={() => setViewerOpen(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {photos.length > 1 && (
            <>
              <button
                onClick={prevPhoto}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={nextPhoto}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="flex items-center justify-center min-h-[60vh] p-4">
            {photos[currentIndex] && (
              <img
                src={photos[currentIndex].url}
                alt=""
                className="max-w-full max-h-[80vh] object-contain"
              />
            )}
          </div>

          {/* Photo info */}
          {photos[currentIndex] && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={photos[currentIndex].user.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {photos[currentIndex].user.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-white">
                  {photos[currentIndex].user.display_name || photos[currentIndex].user.username}
                </span>
              </div>
              <span className="text-white/80 text-sm bg-black/50 rounded-full px-3 py-1.5">
                {currentIndex + 1} / {photos.length}
              </span>
            </div>
          )}

          {/* Quick actions in viewer for pending */}
          {status === "pending" && photos[currentIndex] && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
              <Button
                size="sm"
                className="bg-green-500 hover:bg-green-600 text-white"
                onClick={() => {
                  handleApprove(photos[currentIndex].id);
                  if (photos.length > 1) {
                    setCurrentIndex((prev) => Math.min(prev, photos.length - 2));
                  } else {
                    setViewerOpen(false);
                  }
                }}
                disabled={isActionLoading(photos[currentIndex].id)}
              >
                <Check className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setViewerOpen(false);
                  openRejectDialog(photos[currentIndex].id);
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
