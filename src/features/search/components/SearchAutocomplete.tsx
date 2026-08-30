'use client';

import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { parseQuery, type SearchTagResult, type SearchUserResult } from '@peekpoke/shared';
import { useResolveTagIds } from '@/lib/search/resolveTagIds';
import { useTagSuggestions } from '@/features/search/useTagSuggestions';
import { useUserSearch } from '@/features/search/useUserSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { AvatarWithStatus } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AddFriendButton } from '@/components/ui/AddFriendButton';

type Props = {
  value: string;
  cursorPos: number;
  anchorRef: React.RefObject<HTMLElement>;
  nearbyIds: string[];
  onSelectUser: (userId: string) => void;
  onReplaceActiveTag: (tag: { name: string }) => void;
  onClose: () => void;
  className?: string;
};

export function SearchAutocomplete({
  value,
  cursorPos,
  anchorRef,
  nearbyIds,
  onSelectUser,
  onReplaceActiveTag,
  onClose,
  className,
}: Props): React.ReactElement | null {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Live parse for cursor-sensitive decisions (active tag prefix)
  const parsed = parseQuery(value, cursorPos);

  // Debounced parse for data fetching.
  // Cursor is passed as debouncedValue.length (end of string) because isTagMode
  // (which is cursor-sensitive) is derived from `parsed` (live value), not
  // debouncedParsed — so the end-of-string shortcut is safe here for data-fetch only.
  const debouncedValue = useDebounce(value, 200);
  const debouncedParsed = parseQuery(debouncedValue, debouncedValue.length);

  const isTagMode = parsed.activeTagPrefix !== null;

  // Both hooks always called — enabled conditions gate the fetches
  const { data: tagSuggestions, isLoading: tagsLoading } = useTagSuggestions(
    isTagMode ? parsed.activeTagPrefix : null,
  );

  const { resolvedMap } = useResolveTagIds(debouncedParsed.rawTagTokens);
  const resolvedTagIds = [...resolvedMap.values()].map((t) => t.id);

  const { nearby, others, isLoading: usersLoading } = useUserSearch({
    nameQuery: debouncedParsed.nameQuery,
    tagIds: resolvedTagIds,
    nearbyIds,
  });

  // Flat item list for keyboard navigation
  const flatItems = useMemo<
    Array<
      | { type: 'tag'; item: SearchTagResult }
      | { type: 'user'; item: SearchUserResult }
    >
  >(
    () =>
      isTagMode
        ? tagSuggestions.map((t) => ({ type: 'tag' as const, item: t }))
        : [
            ...nearby.map((u) => ({ type: 'user' as const, item: u })),
            ...others.map((u) => ({ type: 'user' as const, item: u })),
          ],
    [isTagMode, tagSuggestions, nearby, others],
  );

  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(flatItems.length - 1, 0));
  const onCloseEvent = useEffectEvent(onClose);
  const onSelectUserEvent = useEffectEvent(onSelectUser);
  const onReplaceActiveTagEvent = useEffectEvent(onReplaceActiveTag);

  // Click-outside to close
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (!(e.target instanceof Node)) return;
      if (
        !dropdownRef.current?.contains(e.target) &&
        !anchorRef.current?.contains(e.target)
      ) {
        onCloseEvent();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [anchorRef]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseEvent();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, flatItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        const entry = flatItems[safeHighlightedIndex];
        if (!entry) return;
        if (entry.type === 'tag') {
          onReplaceActiveTagEvent({ name: entry.item.name });
        } else {
          onSelectUserEvent(entry.item.id);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [flatItems, safeHighlightedIndex]);

  // Hide when empty input
  if (value.length === 0) return null;

  const isLoading = isTagMode ? tagsLoading : usersLoading;
  const userSearchEnabled =
    debouncedParsed.nameQuery !== '' || resolvedTagIds.length > 0;

  return (
    <div
      ref={dropdownRef}
      className={cn(
        'absolute top-full mt-1 w-full z-50',
        'bg-white/95 backdrop-blur-sm border border-hairline rounded-lg shadow-lg overflow-hidden',
        className,
      )}
    >
      {isLoading ? (
        <div className="p-2 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isTagMode ? (
        <TagSection
          tags={tagSuggestions}
          highlightedIndex={safeHighlightedIndex}
          onSelect={onReplaceActiveTag}
        />
      ) : (
        <UserSection
          nearby={nearby}
          others={others}
          highlightedIndex={safeHighlightedIndex}
          nearbyOffset={0}
          othersOffset={nearby.length}
          searchEnabled={userSearchEnabled}
          onSelect={onSelectUser}
        />
      )}
    </div>
  );
}

// --- Tag section ---

function TagSection({
  tags,
  highlightedIndex,
  onSelect,
}: {
  tags: SearchTagResult[];
  highlightedIndex: number;
  onSelect: (tag: { name: string }) => void;
}) {
  if (tags.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <GroupLabel>Interests</GroupLabel>
      {tags.map((tag, i) => (
        <button
          key={tag.id}
          type="button"
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-ink-1 transition-colors',
            i === highlightedIndex && 'bg-ink-1',
          )}
          onMouseDown={(e) => {
            // Prevent input blur before handler fires
            e.preventDefault();
            onSelect({ name: tag.name });
          }}
        >
          {tag.icon && <span className="text-base leading-none">{tag.icon}</span>}
          <span className="text-ink-8">{tag.name}</span>
        </button>
      ))}
    </div>
  );
}

// --- User section ---

function UserSection({
  nearby,
  others,
  highlightedIndex,
  nearbyOffset,
  othersOffset,
  searchEnabled,
  onSelect,
}: {
  nearby: SearchUserResult[];
  others: SearchUserResult[];
  highlightedIndex: number;
  nearbyOffset: number;
  othersOffset: number;
  searchEnabled: boolean;
  onSelect: (userId: string) => void;
}) {
  const hasResults = nearby.length > 0 || others.length > 0;

  if (!searchEnabled) {
    return (
      <p className="px-3 py-4 text-sm text-ink-5 text-center">
        Type a name or @interest
      </p>
    );
  }
  if (!hasResults) return <EmptyState />;

  return (
    <div>
      {nearby.length > 0 && (
        <>
          <GroupLabel>Nearby</GroupLabel>
          {nearby.map((user, i) => (
            <UserRow
              key={user.id}
              user={user}
              highlighted={nearbyOffset + i === highlightedIndex}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <GroupLabel>People</GroupLabel>
          {others.map((user, i) => (
            <UserRow
              key={user.id}
              user={user}
              highlighted={othersOffset + i === highlightedIndex}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}

function UserRow({
  user,
  highlighted,
  onSelect,
}: {
  user: SearchUserResult;
  highlighted: boolean;
  onSelect: (userId: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2 hover:bg-ink-1 transition-colors',
        highlighted && 'bg-ink-1',
      )}
    >
      <button
        type="button"
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(user.id);
        }}
      >
        <AvatarWithStatus
          src={user.avatar_url}
          fallback={user.display_name || user.username}
          status={user.is_online ? 'online' : 'offline'}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-ink-9 truncate">
              {user.display_name}
            </span>
            <span className="text-xs text-ink-5 truncate">@{user.username}</span>
          </div>
          {user.matched_tags.length > 0 && (
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {user.matched_tags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="text-xs py-0 px-1.5">
                  {tag.icon && <span className="mr-0.5">{tag.icon}</span>}
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </button>
      <AddFriendButton userId={user.id} />
    </div>
  );
}

// --- Shared primitives ---

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 text-xs font-medium text-ink-4 uppercase tracking-wide">
      {children}
    </p>
  );
}

function EmptyState() {
  return (
    <p className="px-3 py-4 text-sm text-ink-5 text-center">No results</p>
  );
}
