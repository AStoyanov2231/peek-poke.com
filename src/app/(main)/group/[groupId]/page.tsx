import { SharedGroupChatContent } from "@/features/chat/components/SharedGroupChatContent";

export default async function Page({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <SharedGroupChatContent groupId={groupId} />;
}
