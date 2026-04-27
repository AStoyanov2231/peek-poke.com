export type ParsedQuery = {
  nameQuery: string;
  rawTagTokens: string[];
  activeTagPrefix: string | null;
};

export function parseQuery(raw: string, cursorPos: number): ParsedQuery {
  if (raw.length === 0) {
    return { nameQuery: '', rawTagTokens: [], activeTagPrefix: null };
  }

  const cursor = Math.max(0, Math.min(cursorPos, raw.length));

  type Token = { text: string; start: number; end: number };
  const tokens: Token[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }

  let activeTagPrefix: string | null = null;
  const nameTokens: string[] = [];
  const rawTagTokens: string[] = [];

  for (const token of tokens) {
    // inclusive on both ends so cursor at the @ or at the last char still activates the token
    const isUnderCursor = cursor >= token.start && cursor <= token.end;

    if (token.text.startsWith('@') && isUnderCursor) {
      activeTagPrefix = token.text.slice(1).toLowerCase();
    } else if (token.text.startsWith('@')) {
      const tagName = token.text.slice(1).toLowerCase();
      if (tagName.length > 0) {
        rawTagTokens.push(tagName);
      }
    } else {
      nameTokens.push(token.text);
    }
  }

  return {
    nameQuery: nameTokens.join(' '),
    rawTagTokens,
    activeTagPrefix,
  };
}
