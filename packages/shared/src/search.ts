import { z } from "zod";
import { displayNameSchema } from "./contract";
import { decodeCursor } from "./cursor";

export type ParsedQuery = {
  nameQuery: string;
  rawTagTokens: string[];
  activeTagPrefix: string | null;
};

export const searchTagRequestSchema = z.strictObject({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export const resolveTagsRequestSchema = z.strictObject({
  names: z.array(z.string().trim().min(1).max(100)).max(50),
});

export const userSearchRequestSchema = z.strictObject({
  q: z.string().trim().max(100).default(""),
  tag_ids: z.array(z.uuid()).max(20).default([]),
  nearby_ids: z.array(z.uuid()).max(500).default([]),
});

export const userSearchQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().refine((value) => decodeCursor(value) !== null, "Invalid cursor").optional(),
});

export function normalizeSearchQuery(value: unknown): unknown {
  if (typeof URLSearchParams === "undefined" || !(value instanceof URLSearchParams)) return value;
  const normalized: Record<string, string> = {};
  for (const [key, entryValue] of value.entries()) {
    if (Object.hasOwn(normalized, key)) {
      return { ...normalized, __duplicate_query_parameter__: key };
    }
    normalized[key] = entryValue;
  }
  return normalized;
}

export const normalizeUserSearchQuery = normalizeSearchQuery;

export const searchTagSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  category: z.string().nullable(),
});

export const resolvedTagSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
});

const matchedSearchTagSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
});

export const searchUserSchema = z.strictObject({
  id: z.uuid(),
  username: z.string().min(1).max(64),
  display_name: displayNameSchema,
  avatar_url: z.string().nullable(),
  is_online: z.boolean(),
  is_nearby: z.boolean(),
  matched_tags: z.array(matchedSearchTagSchema),
  rank: z.number(),
});

export const searchTagResultsSchema = z.array(searchTagSchema).max(50);
export const resolvedTagsSchema = z.array(resolvedTagSchema).max(50);
export const searchUserResultsSchema = z.array(searchUserSchema).max(50);
export const searchUserRpcResultsSchema = z.array(searchUserSchema).max(51);

export function searchTagResultsSchemaForLimit(limit: number) {
  return z.array(searchTagSchema).max(limit);
}

export function resolvedTagsSchemaForRequest(names: readonly string[]) {
  const requestedNames = new Set(names.map((name) => name.trim().toLowerCase()));
  return z.array(resolvedTagSchema).max(names.length).superRefine((tags, context) => {
    const returnedNames = new Set<string>();
    for (const [index, tag] of tags.entries()) {
      const canonicalName = tag.name.trim().toLowerCase();
      if (!requestedNames.has(canonicalName)) {
        context.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Resolved tag was not requested",
        });
      }
      if (returnedNames.has(canonicalName)) {
        context.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Duplicate resolved tag",
        });
      }
      returnedNames.add(canonicalName);
    }
  });
}

export function searchUserResultsSchemaForLimit(limit: number) {
  return z.array(searchUserSchema).max(limit);
}

export type SearchUserResult = z.infer<typeof searchUserSchema>;
export type SearchTagResult = z.infer<typeof searchTagSchema>;
export type ResolvedTag = z.infer<typeof resolvedTagSchema>;
export type ResolveTagsRequest = z.infer<typeof resolveTagsRequestSchema>;
export type UserSearchRequest = z.infer<typeof userSearchRequestSchema>;
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;

export type ResolvedTagMap = Map<string, ResolvedTag>;

export function parseQuery(raw: string, cursorPos: number): ParsedQuery {
  if (raw.length === 0) {
    return { nameQuery: "", rawTagTokens: [], activeTagPrefix: null };
  }

  const cursor = Math.max(0, Math.min(cursorPos, raw.length));
  const tokens: Array<{ text: string; start: number; end: number }> = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }

  let activeTagPrefix: string | null = null;
  const nameTokens: string[] = [];
  const rawTagTokens: string[] = [];

  for (const token of tokens) {
    const isUnderCursor = cursor >= token.start && cursor <= token.end;
    if (token.text.startsWith("@") && isUnderCursor) {
      activeTagPrefix = token.text.slice(1).toLowerCase();
    } else if (token.text.startsWith("@")) {
      const tagName = token.text.slice(1).toLowerCase();
      if (tagName.length > 0) rawTagTokens.push(tagName);
    } else {
      nameTokens.push(token.text);
    }
  }

  return {
    nameQuery: nameTokens.join(" "),
    rawTagTokens,
    activeTagPrefix,
  };
}
