import { RoomChatContent } from "@/features/rooms/components/RoomChatContent";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomChatContent roomId={roomId} />;
}
