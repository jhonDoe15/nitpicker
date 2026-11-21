export type ParsedJsonc =
  | { readonly kind: 'json'; readonly value: unknown }
  | { readonly kind: 'malformed'; readonly reason: string };

const BOM = '\uFEFF';
const COMMENT_OR_STRING = /"(?:[^"\\]|\\[\s\S])*"?|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/gu;
const COMMA_OR_STRING = /"(?:[^"\\]|\\[\s\S])*"?|,(?=\s*[\]}])/gu;

function withoutComments(text: string): string {
  return text.replace(COMMENT_OR_STRING, (match: string) => (match.startsWith('"') ? match : ''));
}

function withoutTrailingCommas(text: string): string {
  return text.replace(COMMA_OR_STRING, (match: string) => (match === ',' ? '' : match));
}

export function parseJsonc(text: string): unknown {
  const content = text.startsWith(BOM) ? text.slice(1) : text;
  return JSON.parse(withoutTrailingCommas(withoutComments(content)));
}

export function parsedJsonc(text: string): ParsedJsonc {
  try {
    return { kind: 'json', value: parseJsonc(text) };
  } catch (error) {
    return { kind: 'malformed', reason: error instanceof Error ? error.message : String(error) };
  }
}
