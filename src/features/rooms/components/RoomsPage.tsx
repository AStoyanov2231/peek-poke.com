"use client";

import { useCallback, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, ScanLine, Users, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { appRoutes } from "@peekpoke/shared";
import { createRoom, joinRoom, roomsQueryOptions } from "@/data/rooms";
import { webQueryKeys } from "@/data/web-query";
import { QrRoomScanner } from "@/features/rooms/components/QrRoomScanner";

export default function RoomsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const roomsQuery = useInfiniteQuery(roomsQueryOptions);
  const rooms = roomsQuery.data?.pages.flatMap((page) => page.rooms) ?? [];
  const [scannerOpen, setScannerOpen] = useState(false);
  const [createdPayload, setCreatedPayload] = useState<string | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: (response) => {
      setJoinError(null);
      setCreatedPayload(response.qr_payload);
      setCreatedRoomId(response.room.id);
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
    },
    onError: () => setJoinError("A room could not be created. Try again."),
  });

  const joinMutation = useMutation({
    mutationFn: joinRoom,
    onSuccess: (response) => {
      // Do not retain the scanned capability after the server has resolved it.
      setScannerOpen(false);
      setJoinError(null);
      void queryClient.invalidateQueries({ queryKey: webQueryKeys.rooms });
      router.push(appRoutes.room(response.room.id));
    },
    onError: (error) => {
      setJoinError(error instanceof Error ? error.message : "That QR code could not be used.");
    },
  });

  const handlePayload = useCallback((payload: string) => {
    if (joinMutation.isPending) return;
    setJoinError(null);
    joinMutation.mutate(payload);
  }, [joinMutation]);

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-8 md:px-10 md:py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="t-overline text-primary">PEEK &amp; POKE</p>
            <h1 className="mt-2 t-display text-ink-9">Room together.</h1>
            <p className="mt-2 max-w-md t-body text-ink-6">
              Scan the same QR code as your crew to join one shared conversation. No map or location sharing required.
            </p>
          </div>
          <div className="hidden rounded-2xl bg-ink-1 p-4 md:block">
            <Users size={28} className="text-primary" strokeWidth={1.6} />
          </div>
        </header>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink-9 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={() => setScannerOpen(true)}
            disabled={joinMutation.isPending}
          >
            <ScanLine size={18} /> Scan a QR code
          </button>
          <button
            type="button"
            className="btn btn-secondary min-h-14 rounded-xl"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <Plus size={18} /> {createMutation.isPending ? "Creating…" : "Create a room QR"}
          </button>
        </div>

        {joinError ? <p role="alert" className="mt-3 text-sm text-danger-600">{joinError}</p> : null}

        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="t-title-3 text-ink-9">Your rooms</h2>
            {roomsQuery.isFetching ? <span className="t-caption muted">Refreshing…</span> : null}
          </div>
          {roomsQuery.isError ? (
            <div className="rounded-xl border border-hairline bg-surface p-5">
              <p className="t-body text-ink-8">Rooms could not be loaded.</p>
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void roomsQuery.refetch()}>
                Try again
              </button>
            </div>
          ) : roomsQuery.isPending ? (
            <div className="rounded-xl border border-hairline bg-surface p-5 t-body muted">Loading rooms…</div>
          ) : rooms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline bg-surface p-8 text-center">
              <Users size={28} className="mx-auto text-primary" strokeWidth={1.6} />
              <p className="mt-3 t-body-b text-ink-8">No rooms yet</p>
              <p className="mt-1 t-caption muted">Scan a room QR code or create one to start chatting.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {rooms.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className="flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4 text-left transition-colors hover:bg-ink-1"
                  onClick={() => router.push(appRoutes.room(room.id))}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
                    <Users size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="t-body-b truncate text-ink-9">{room.name}</p>
                    <p className="t-caption muted">{room.member_count} {room.member_count === 1 ? "member" : "members"}</p>
                  </div>
                  {room.unread_count > 0 ? <span className="badge">{room.unread_count > 9 ? "9+" : room.unread_count}</span> : null}
                </button>
              ))}
              {roomsQuery.hasNextPage ? (
                <button
                  type="button"
                  className="btn btn-secondary mt-1 w-full"
                  disabled={roomsQuery.isFetchingNextPage}
                  onClick={() => void roomsQuery.fetchNextPage()}
                >
                  {roomsQuery.isFetchingNextPage ? "Loading more…" : "Load more rooms"}
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {scannerOpen ? <QrRoomScanner onPayload={handlePayload} onClose={() => setScannerOpen(false)} /> : null}
      {createdPayload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 text-center shadow-e-2">
            <div className="flex justify-end"><button type="button" className="iconbtn" aria-label="Close QR code" onClick={() => { setCreatedPayload(null); setCreatedRoomId(null); }}><X size={18} /></button></div>
            <h2 className="t-title-3 text-ink-9">Share this room QR</h2>
            <p className="mt-1 t-caption muted">Anyone who scans it joins this group room.</p>
            <div className="mx-auto mt-5 w-fit rounded-xl bg-white p-4"><QRCodeSVG value={createdPayload} size={220} includeMargin /></div>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-5"
              onClick={() => { void navigator.clipboard?.writeText(createdPayload); }}
            >
              <Copy size={15} /> Copy code
            </button>
            <button type="button" className="btn btn-primary btn-sm ml-2 mt-5" onClick={() => { if (!createdRoomId) return; setCreatedPayload(null); setCreatedRoomId(null); router.push(appRoutes.room(createdRoomId)); }}>
              Open room
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
