import {
  literalText as untypedLiteralText,
  regexSites as untypedRegexSites,
  trimmed as untypedTrimmed,
} from '../../../../../adapters/kotlin/scan/regexes/regex-values.mjs';
import { kotlinRecipe } from '../../shared/kotlin-recipe.mts';
import { splitArguments } from '../../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin, Span } from '../../shared/kotlin-scan.mts';
import { receiverKind } from './receiver-kind.mts';

type RegexSite = {
  readonly part: Span | undefined;
  readonly count: number;
  readonly start: number;
  readonly end: number;
};

const regexSites: (scanned: ScannedKotlin) => readonly RegexSite[] = untypedRegexSites;
const literalText: (scanned: ScannedKotlin, part: Span) => string | undefined = untypedLiteralText;
const trimmed: (code: string, span: Span) => Span = untypedTrimmed;

const PLAIN_USE = /\.\s*(replace|replaceFirst|split|contains)\s*\(/gu;
const TRAILING_LAMBDA = /^[ \t]*\{/u;
const GROUP_REFERENCE = /[$\\]/u;
const METACHARACTERS = /[\\^$.|?*+()[\]{}]/u;
const NARROW_RECEIVER = /\b(?:CharSequence|StringBuilder|StringBuffer|Appendable|buildString)\b/u;
const REPLACING = new Set(['replace', 'replaceFirst']);

function replacementIsPlain(scanned: ScannedKotlin, part: Span | undefined): boolean {
  const text = part === undefined ? undefined : literalText(scanned, part);
  return text !== undefined && !GROUP_REFERENCE.test(text);
}

function accepted(
  scanned: ScannedKotlin,
  match: RegExpMatchArray,
  parts: readonly Span[],
): boolean {
  const kind = receiverKind(scanned.code, match.index ?? 0);
  if (kind === undefined) {
    return false;
  }
  if (REPLACING.has(match[1] ?? '')) {
    return (
      kind === 'String' &&
      parts.length === 2 &&
      !NARROW_RECEIVER.test(scanned.code) &&
      replacementIsPlain(scanned, parts[1])
    );
  }
  return parts.length === 1;
}

function isPlain(text: string | undefined): boolean {
  return text !== undefined && text !== '' && !METACHARACTERS.test(text);
}

export const plainTextRegexRecipe = kotlinRecipe({
  id: 'kotlin-plain-text-regex',
  rules: [{ tool: 'kotlin-source', rule: 'PlainTextRegex' }],
  safety: 'review',
  keepComments: true,
  find(scanned): readonly KotlinFound[] {
    const { code, source } = scanned;
    const sites = regexSites(scanned).filter((site) => site.count === 1);
    return [...code.matchAll(PLAIN_USE)].flatMap((match) => {
      const open = match.index + match[0].length - 1;
      const { close, parts } = splitArguments(code, open);
      const [first] = parts;
      if (first === undefined || !accepted(scanned, match, parts)) {
        return [];
      }
      const argument = trimmed(code, first);
      const site = sites.find(({ start, end }) => start === argument.start && end === argument.end);
      if (
        site?.part === undefined ||
        !isPlain(literalText(scanned, site.part)) ||
        TRAILING_LAMBDA.test(code.slice(close + 1))
      ) {
        return [];
      }
      const literal = trimmed(code, site.part);
      return [
        {
          offset: site.start,
          edits: [
            { start: site.start, end: site.end, text: source.slice(literal.start, literal.end) },
          ],
        },
      ];
    });
  },
});
