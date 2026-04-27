export type SearchUserResult = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
  is_nearby: boolean;
  matched_tags: Array<{ id: string; name: string; icon: string | null }>;
  rank: number;
};

export type SearchTagResult = {
  id: string;
  name: string;
  icon: string | null;
  category: string | null;
};

export type ResolvedTagMap = Map<string, { id: string; name: string; icon: string | null }>;
