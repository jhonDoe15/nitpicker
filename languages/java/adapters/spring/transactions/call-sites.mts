import type { CallSite, CallSource } from './transaction-types.mts';

const CALL_SITE = /([\w$]+)\s*\(|::\s*([\w$]+)/gu;
const DECLARATION_PREFIX = /[\w$>\]]\s+$/u;
const EXPRESSION_KEYWORD = /\b(?:return|new|throw|else|case|assert|yield|await|in|is|do|when)\s+$/u;
const DECLARATION_LOOKBEHIND = 40;

function isDeclaration(text: string, match: RegExpExecArray): boolean {
  if (match[2] !== undefined) {
    return false;
  }
  const before = text.slice(Math.max(0, match.index - DECLARATION_LOOKBEHIND), match.index);
  return DECLARATION_PREFIX.test(before) && !EXPRESSION_KEYWORD.test(before);
}

function callSitesOf({ file, text }: CallSource): { name: string; site: CallSite }[] {
  return [...text.matchAll(CALL_SITE)]
    .filter((match) => !isDeclaration(text, match))
    .map((match) => ({
      name: match[1] ?? match[2] ?? '',
      site: { file, offset: match.index, reference: match[2] !== undefined },
    }));
}

export function indexCalls(sources: readonly CallSource[]): Map<string, CallSite[]> {
  const calls = new Map<string, CallSite[]>();
  for (const { name, site } of sources.flatMap(callSitesOf)) {
    calls.set(name, [...(calls.get(name) ?? []), site]);
  }
  return calls;
}
