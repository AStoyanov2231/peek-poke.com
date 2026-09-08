'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus, UserCheck } from 'lucide-react';
import { useFriends, useFriendRequests, useProfile, useSentRequests } from '@/stores/selectors';
import { cn } from '@/lib/utils';
import { webQueryKeys } from '@/data/web-query';
import { sendFriendRequest } from '@/data/friend-mutations';

export function AddFriendButton({ userId, className }: { userId: string; className?: string }) {
  const queryClient = useQueryClient();
  const friends = useFriends();
  const requests = useFriendRequests();
  const sentRequests = useSentRequests();
  const profileId = useProfile()?.id;
  const [loading, setLoading] = useState(false);

  const isFriend = friends.some((f) => f.id === userId);
  const hasIncoming = requests.some((r) => r.requester.id === userId);
  const hasSent = sentRequests.some((request) => request.addressee_id === userId);

  if (isFriend || hasIncoming || userId === profileId) return null;

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loading || hasSent) return;
    setLoading(true);
    try {
      await sendFriendRequest(userId, () => {
        void queryClient.invalidateQueries({ queryKey: webQueryKeys.friends });
      });
    } catch (error) {
      console.error("Failed to send friend request:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleAdd}
        disabled={loading || hasSent}
        className={cn('btn btn-secondary btn-sm flex-shrink-0 disabled:opacity-50', className)}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : hasSent ? (
          <><UserCheck className="h-3.5 w-3.5 mr-1" />Sent</>
        ) : (
          <><UserPlus className="h-3.5 w-3.5 mr-1" />Add</>
        )}
      </button>
    </>
  );
}
