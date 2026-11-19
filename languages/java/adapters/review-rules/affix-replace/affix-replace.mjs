import {
  lastName,
  methodCalls,
  shortText,
  startOfStatement,
  stringNames,
  textOf,
} from '../token-calls/calls.mjs';
import { isDirectoryName, isStringCall, wordsOf } from '../affix-boundaries/names.mjs';
import { literalText } from '../affix-boundaries/boundaries.mjs';

export const AFFIX_REPLACE_RULE = 'AffixRemovedByReplace';
export const AFFIX_REPLACE_EXCEPTION_RULE = `pmd/${AFFIX_REPLACE_RULE}`;

const SUFFIX_LITERAL = /^\.[a-z0-9]{1,8}$/iu;
const SUFFIX = 'suffix';
const PREFIX = 'prefix';
const AFFIX_WORDS = new Set([SUFFIX, PREFIX]);
const CHECKS = new Set(['startsWith', 'endsWith']);
const REPLACEMENTS = new Set(['', '~']);

function isStringReceiver(source, receiver, strings) {
  const { tokens } = source;
  const plain = receiver.to - receiver.from === 1 || tokens[receiver.from].text === 'this';
  const last = tokens[receiver.to - 1];
  return plain
    ? strings.has(last.text)
    : last.text === ')' && isStringCall(lastName(source, receiver));
}

function affixKind(source, arg, replacement) {
  const text = literalText(source.tokens[arg.from]);
  if (arg.to - arg.from === 1 && text !== undefined) {
    return SUFFIX_LITERAL.test(text) && replacement === '' ? SUFFIX : undefined;
  }
  const name = lastName(source, arg);
  const last = name === undefined ? undefined : wordsOf(name).at(-1);
  const affix = AFFIX_WORDS.has(last) || isDirectoryName(name);
  if (!(affix && REPLACEMENTS.has(replacement))) {
    return undefined;
  }
  return last === SUFFIX ? SUFFIX : PREFIX;
}

function guardStart(source, call) {
  const { tokens, partner } = source;
  const start = startOfStatement(source, call.receiver.from);
  const before = tokens.slice(0, start).findLastIndex((token) => token.text !== '{');
  const condition = tokens[before]?.text === ')' ? partner[before] : -1;
  return condition >= 0 && tokens[condition - 1]?.text === 'if' ? condition : start;
}

function isGuarded(source, calls, call) {
  const from = guardStart(source, call);
  const pattern = textOf(source, call.args[0]);
  return calls.some(
    (other) =>
      CHECKS.has(other.name) &&
      other.index >= from &&
      other.index < call.index &&
      other.args.length === 1 &&
      textOf(source, other.args[0]) === pattern,
  );
}

export function findAffixReplaces(source) {
  const strings = stringNames(source);
  const calls = methodCalls(source);
  return calls.flatMap((call) => {
    const { receiver, args } = call;
    if (call.name !== 'replace' || receiver === undefined || args.length !== 2) {
      return [];
    }
    const replacement = literalText(source.tokens[args[1].from]);
    const single = args[1].to - args[1].from === 1;
    if (!single || replacement === undefined || !isStringReceiver(source, receiver, strings)) {
      return [];
    }
    const kind = affixKind(source, args[0], replacement);
    return kind === undefined || isGuarded(source, calls, call)
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

function messageFor(kind, kotlin) {
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

export const affixReplaceRule = {
  id: AFFIX_REPLACE_RULE,
  find: findAffixReplaces,
  message: ({ kind }, kotlin) => messageFor(kind, kotlin),
};

export const AFFIX_REPLACE_ALLOWED = messageFor(SUFFIX, false);
