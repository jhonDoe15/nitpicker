import {
  lastName,
  methodCalls,
  shortText,
  startOfStatement,
  stringNames,
  textOf,
} from '../token-calls/calls.mts';
import type { TokenCall } from '../token-calls/calls.mts';
import { isDirectoryName, isStringCall, wordsOf } from '../affix-boundaries/names.mts';
import { literalText } from '../affix-boundaries/boundaries.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { MinedItem, MinedRule } from '../review-types.mts';

export const AFFIX_REPLACE_RULE = 'AffixRemovedByReplace';
export const AFFIX_REPLACE_EXCEPTION_RULE = `pmd/${AFFIX_REPLACE_RULE}`;

const SUFFIX_LITERAL = /^\.[a-z0-9]{1,8}$/iu;
const SUFFIX = 'suffix';
const PREFIX = 'prefix';
const AFFIX_WORDS = new Set([SUFFIX, PREFIX]);
const CHECKS = new Set(['startsWith', 'endsWith']);
const REPLACEMENTS = new Set(['', '~']);

function isStringReceiver(
  source: BareSource,
  receiver: Span,
  strings: ReadonlySet<string>,
): boolean {
  const { tokens } = source;
  const plain = receiver.to - receiver.from === 1 || tokens[receiver.from]?.text === 'this';
  const last = tokens[receiver.to - 1]?.text ?? '';
  return plain ? strings.has(last) : last === ')' && isStringCall(lastName(source, receiver));
}

function affixKind(source: BareSource, arg: Span, replacement: string): string | undefined {
  const text = literalText(source.tokens[arg.from]);
  if (arg.to - arg.from === 1 && text !== undefined) {
    return SUFFIX_LITERAL.test(text) && replacement === '' ? SUFFIX : undefined;
  }
  const name = lastName(source, arg);
  const last = name === undefined ? undefined : wordsOf(name).at(-1);
  const affix = (last !== undefined && AFFIX_WORDS.has(last)) || isDirectoryName(name);
  if (!(affix && REPLACEMENTS.has(replacement))) {
    return undefined;
  }
  return last === SUFFIX ? SUFFIX : PREFIX;
}

function guardStart(source: BareSource, receiver: Span): number {
  const { tokens, partner } = source;
  const start = startOfStatement(source, receiver.from);
  const before = tokens.slice(0, start).findLastIndex((token) => token.text !== '{');
  const condition = tokens[before]?.text === ')' ? (partner[before] ?? -1) : -1;
  return condition >= 0 && tokens[condition - 1]?.text === 'if' ? condition : start;
}

function isGuarded(
  source: BareSource,
  calls: TokenCall[],
  { call, receiver, pattern }: { call: TokenCall; receiver: Span; pattern: Span },
): boolean {
  const from = guardStart(source, receiver);
  const patternText = textOf(source, pattern);
  return calls.some(
    (other) =>
      CHECKS.has(other.name) &&
      other.index >= from &&
      other.index < call.index &&
      other.args.length === 1 &&
      other.args[0] !== undefined &&
      textOf(source, other.args[0]) === patternText,
  );
}

export function findAffixReplaces(source: SourceFile): MinedItem[] {
  const strings = stringNames(source);
  const calls = methodCalls(source);
  return calls.flatMap((call) => {
    const { receiver, args } = call;
    const [pattern, last] = args;
    if (
      call.name !== 'replace' ||
      receiver === undefined ||
      args.length !== 2 ||
      pattern === undefined ||
      last === undefined
    ) {
      return [];
    }
    const replacement = literalText(source.tokens[last.from]);
    const single = last.to - last.from === 1;
    if (!single || replacement === undefined || !isStringReceiver(source, receiver, strings)) {
      return [];
    }
    const kind = affixKind(source, pattern, replacement);
    return kind === undefined || isGuarded(source, calls, { call, receiver, pattern })
      ? []
      : [
          {
            line: call.line,
            kind,
            symbol: 'replace',
            key: shortText(textOf(source, { from: receiver.from, to: call.close + 1 })),
          },
        ];
  });
}

function messageFor(kind: string | undefined, kotlin: boolean): string {
  const part = kind === SUFFIX ? SUFFIX : PREFIX;
  const fix = kotlin
    ? '`removeSuffix(".git")` or `removePrefix(root)`'
    : '`endsWith` and `substring`, or `startsWith` and `substring` for a prefix';
  const where = kind === SUFFIX ? 'end' : 'start';
  return (
    `\`replace\` removes the ${part} anywhere in the text, not only at the ${where} ` +
    `(\`blog.git.io\` loses its \`.git\`). Remove it with an anchored check: ${fix}.`
  );
}

export const affixReplaceRule: MinedRule = {
  id: AFFIX_REPLACE_RULE,
  find: findAffixReplaces,
  message: ({ kind }, kotlin) => messageFor(kind, kotlin),
};

export const AFFIX_REPLACE_ALLOWED = messageFor(SUFFIX, false);
