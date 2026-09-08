"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { acceptInvite, fetchInvitePreview } from "@/data/invites";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { webQueryKeys } from "@/data/web-query";

export default function InvitePage() {
  const params = useParams<{ inviterId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const preview = useQuery({ queryKey: ["web", "invite-preview", params.inviterId], queryFn: ({ signal }) => fetchInvitePreview(params.inviterId, signal), enabled: Boolean(params.inviterId), retry: false });
  const accept = useMutation({
    mutationFn: () => acceptInvite(params.inviterId),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: webQueryKeys.friends });
      router.replace(`/profile/${data.profile_id}`);
    },
  });

  return <main className="flex min-h-[70vh] items-center justify-center px-6"><Card className="flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center">
    {preview.isPending ? <><Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Checking this invitation…</p></> : preview.isError || !preview.data ? <><h1 className="font-display text-xl font-bold text-foreground">This invite is unavailable</h1><p role="alert" className="text-sm text-muted-foreground">It may be invalid, expired, or no longer available.</p><Button type="button" variant="secondary" onClick={() => void preview.refetch()}>Try again</Button></> : <><Avatar className="h-16 w-16"><AvatarImage src={preview.data.profile.avatar_url ?? undefined} alt={preview.data.profile.display_name ?? preview.data.profile.username} /><AvatarFallback name={preview.data.profile.display_name ?? preview.data.profile.username} /></Avatar><div><h1 className="font-display text-xl font-bold text-foreground">Connect with {preview.data.profile.display_name ?? preview.data.profile.username}?</h1><p className="mt-2 text-sm text-muted-foreground">Review the invitation, then choose whether to connect.</p></div>{accept.isError ? <p role="alert" className="text-sm text-destructive">{accept.error.message}</p> : null}<Button type="button" disabled={accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Connect</Button><Button type="button" variant="ghost" onClick={() => router.replace("/now")}>Not now</Button></>}
  </Card></main>;
}
