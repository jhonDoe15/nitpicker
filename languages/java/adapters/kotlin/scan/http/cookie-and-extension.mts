import { escapeRegExp } from '../typed/typed-scan.mts';
import { closingIndex, literalAt } from '../kotlin-source.mts';
import type { Scanned } from '../typed/scan-shapes.mts';

const RULE = 'HttpValueCase';
const COOKIE_PREFIX = /^__(?:Host|Secure)-/;
const PREFIX_CALL = /\.\s*startsWith\s*\(\s*(?<quote>")/g;
const IGNORE_CASE = /,\s*(?:ignoreCase\s*=\s*)?true\b/;
const LOWERED = /\.\s*(?:lowercase|uppercase|toLowerCase|toUpperCase)\s*\([^()]*\)\s*\??$/;
const EXTENSION_FORMS = [
  String.raw`\.\s*extension`,
  String.raw`\.\s*substringAfterLast\s*\(\s*['"][ .]['"]\s*\)`,
  String.raw`\.\s*substring\s*\([^()]*lastIndexOf\s*\([^()]*\)[^()]*\)`,
  String.raw`(?:FilenameUtils|StringUtils)\s*\.\s*(?:getExtension|getFilenameExtension)\s*\([^()]*\)`,
];
const EXTENSION = String.raw`[\w.()?]*?(?:${EXTENSION_FORMS.join('|')})`;
const TABLE = String.raw`\b\w*(?:mime|content_?type)\w*\s*(?:\[|\.\s*(?:get|getOrDefault|containsKey)\s*\()\s*`;
const INLINE_LOOKUP = new RegExp(String.raw`${TABLE}${EXTENSION}\s*[\]),]`, 'gi');
const LOCAL_EXTENSION = new RegExp(
  String.raw`\bval\s+(\w+)\s*(?::[^=\n]+)?=\s*${EXTENSION}\s*$`,
  'gmi',
);

export function cookiePrefixes(scanned: Scanned): { rule: string; offset: number }[] {
  return [...scanned.code.matchAll(PREFIX_CALL)]
    .filter((match) => {
      const quote = match.index + match[0].length - 1;
      const literal = literalAt(scanned, quote);
      const close = closingIndex(scanned.code, scanned.code.indexOf('(', match.index));
      return (
        literal !== undefined &&
        COOKIE_PREFIX.test(literal.text) &&
        !IGNORE_CASE.test(scanned.source.slice(quote, close)) &&
        !LOWERED.test(scanned.code.slice(0, match.index))
      );
    })
    .map((match) => ({ rule: RULE, offset: match.index }));
}

function localLookups(code: string): { rule: string; offset: number }[] {
  return [...code.matchAll(LOCAL_EXTENSION)].flatMap((declared) => {
    const uses = new RegExp(String.raw`${TABLE}${escapeRegExp(declared[1] ?? '')}\s*[\]),]`, 'gi');
    const from = declared.index + declared[0].length;
    return [...code.slice(from).matchAll(uses)].map((use) => ({
      rule: RULE,
      offset: from + use.index,
    }));
  });
}

export function extensionLookups(scanned: Scanned): { rule: string; offset: number }[] {
  const inline = [...scanned.code.matchAll(INLINE_LOOKUP)].map((match) => ({
    rule: RULE,
    offset: match.index,
  }));
  return [...inline, ...localLookups(scanned.code)];
}
