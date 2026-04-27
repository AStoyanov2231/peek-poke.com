'use client';

import { useState } from 'react';
import { Loader2, UserPlus, UserCheck } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useFriends, useFriendRequests } from '@/stores/selectors';
import { UpgradeDialog } from '@/components/ui/UpgradeDialog';
import { InsufficientCoinsDialog } from '@/components/coins/InsufficientCoinsDialog';
import { cn } from '@/lib/utils';

export function AddFriendButton({ userId, className }: { userId: string; className?: string }) {
  const friends = useFriends();
  const requests = useFriendRequests();
  const profileId = useAppStore((s) => s.profile?.id);
  const sentRequestUserIds = useAppStore((s) => s.sentRequestUserIds);
  const addSentRequest = useAppStore((s) => s.addSentRequest);
  const addSentRequestFull = useAppStore((s) => s.addSentRequestFull);
  const coins = useAppStore((s) => s.coins);
  const setCoins = useAppStore((s) => s.setCoins);
  const [loading, setLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [noCoins, setNoCoins] = useState(false);

  const isFriend = friends.some((f) => f.id === userId);
  const hasIncoming = requests.some((r) => r.requester.id === userId);
  const hasSent = sentRequestUserIds.has(userId);

  if (isFriend || hasIncoming || userId === profileId) return null;

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loading || hasSent) return;
    if (coins < 1) { setNoCoins(true); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressee_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === 'FRIEND_LIMIT_REACHED' || data?.error === 'REQUESTER_LIMIT_REACHED') {
          setUpgradeMessage(data.message ?? '');
          setUpgradeOpen(true);
        }
        return;
      }
      if (data?.balance !== undefined) setCoins(data.balance);
      if (data?.id) {
        addSentRequestFull(data);
      } else {
        addSentRequest(userId);
      }
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
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} message={upgradeMessage} />
      <InsufficientCoinsDialog open={noCoins} onOpenChange={setNoCoins} />
    </>
  );
}
