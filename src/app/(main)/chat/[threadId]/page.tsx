import ChatPage from "@/features/chat/components/ChatPage";

export default function Page({ params }: { params: Promise<{ threadId: string }> }) {
  return <ChatPage params={params} />;
}
