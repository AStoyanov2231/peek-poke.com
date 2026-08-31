"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { roomMembershipHintSchema, roomMessageHintSchema, roomUnreadHintSchema } from "@peekpoke/shared";
import { useIsPreloading } from "@/stores/selectors";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { roomsQueryOptions } from "@/data/rooms";
import { bootstrapQueryOptions, webQueryKeys } from "@/data/web-query";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/**
 * Orchestrator for the QR-room client realtime surface.
 *
 * Legacy friendship/DM synchronization remains available to old deployed
 * clients, but is intentionally not mounted by the new application flow.
 * Room events are hints only; durable state is always re-read through the
 * authenticated room APIs.
 */
export function useRealtimeSync() {
  const isPreloading = useIsPreloading();
  const queryClient = useQueryClient();
  const bootstrap = useQuery(bootstrapQueryOptions);
  const roomsQuery = useInfiniteQuery(roomsQueryOptions);
  const userId = bootstrap.data?.identity.id;
  const roomIds = useMemo(
    () => (roomsQuery.data?.pages.flatMap((page) => page.rooms) ?? []).map((room) => room.id).sort(),
    [roomsQuery.data?.pages],
  );

  useRealtimeProfiles({ isPreloading });

  useEffect(() => {
    if (isPreloading || !userId) return;

    const userChannel = supabase
      .channel(`sync:user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "rooms-unread-changed" }, (event) => {
        const parsed = roomUnreadHintSchema.safeParse(event.payload);
        if (!parsed.success) return;
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.bootstrap });
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
      })
      .on("broadcast", { event: "rooms-membership-changed" }, (event) => {
        const parsed = roomMembershipHintSchema.safeParse(event.payload);
        if (!parsed.success) return;
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.bootstrap });
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
      })
      .subscribe();

    const channels = roomIds.map((roomId) => supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "messages-changed" }, (event) => {
        const parsed = roomMessageHintSchema.safeParse(event.payload);
        if (!parsed.success || parsed.data.room_id !== roomId) return;
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.bootstrap });
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.roomMessages(roomId) });
      })
      .subscribe());

    return () => {
      void userChannel.unsubscribe();
      void supabase.removeChannel(userChannel);
      channels.forEach((channel) => {
        void channel.unsubscribe();
        void supabase.removeChannel(channel);
      });
    };
  }, [isPreloading, queryClient, roomIds, userId]);
}
