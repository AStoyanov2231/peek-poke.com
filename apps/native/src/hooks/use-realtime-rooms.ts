import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { roomMembershipHintSchema, roomMessageHintSchema, roomUnreadHintSchema } from "@peekpoke/shared";
import { roomsQueryOptions } from "@/data/rooms";
import { nativeQueryKeys } from "@/data/query-keys";
import { supabase } from "@/lib/supabase";

/** Room realtime carries hints only; durable state is re-read through the API. */
export function useRealtimeRooms(userId: string | undefined) {
  const queryClient = useQueryClient();
  const roomsQuery = useInfiniteQuery({
    ...roomsQueryOptions,
    enabled: Boolean(userId),
  });
  const roomIds = useMemo(
    () => (roomsQuery.data?.pages.flatMap((page) => page.rooms) ?? []).map((room) => room.id).sort(),
    [roomsQuery.data?.pages],
  );

  useEffect(() => {
    if (!userId) return;
    const userChannel = supabase
      .channel(`sync:user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "rooms-unread-changed" }, (event) => {
        const parsed = roomUnreadHintSchema.safeParse(event.payload);
        if (!parsed.success) return;
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.bootstrap });
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
      })
      .on("broadcast", { event: "rooms-membership-changed" }, (event) => {
        const parsed = roomMembershipHintSchema.safeParse(event.payload);
        if (!parsed.success) return;
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.bootstrap });
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
      })
      .subscribe();
    const channels = roomIds.map((roomId) => supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "messages-changed" }, (event) => {
        const parsed = roomMessageHintSchema.safeParse(event.payload);
        if (!parsed.success || parsed.data.room_id !== roomId) return;
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.list });
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.bootstrap });
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.rooms.messages(roomId) });
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
  }, [queryClient, roomIds, userId]);
}
