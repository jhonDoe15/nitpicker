import { methodCalls, shortText, textOf } from '../token-calls/calls.mts';
import type { TokenCall } from '../token-calls/calls.mts';
import { literalText } from '../affix-boundaries/boundaries.mts';
import { isDerivedFrom, scopeNamesOf } from './scope-names.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { MinedItem, MinedRule } from '../review-types.mts';

export const PRECONDITION_MESSAGE_RULE = 'PreconditionMessageNamesOtherValue';
export const PRECONDITION_MESSAGE_EXCEPTION_RULE = `pmd/${PRECONDITION_MESSAGE_RULE}`;

const SUBJECT = new RegExp(
  '^[`\'"]?([a-z_$][\\w$]*)[`\'"]?\\s+' +
    "(?:must|should|is|are|was|cannot|can't|can not|may not|has|have|required|needs|not)\\b",
  'iu',
);
const ELEMENT_CHECK = /\bcontain/iu;
const CHECK_NOT_NULL = 'checkNotNull';
const OWNERS = new Set(['Assert', 'Objects', 'Preconditions', 'Validate']);
const VALUE_CHECKS = new Set([
  'notNull',
  'hasText',
  'hasLength',
  'notEmpty',
  'notBlank',
  'noNullElements',
  'requireNonNull',
  CHECK_NOT_NULL,
  'requireNotNull',
]);
const CONDITION_CHECKS = new Set([
  'isTrue',
  'isFalse',
  'state',
  'checkArgument',
  'checkState',
  'require',
  'check',
]);
const BARE_JAVA = new Set(['requireNonNull', CHECK_NOT_NULL, 'checkArgument', 'checkState']);
const BARE_KOTLIN = new Set(['requireNotNull', CHECK_NOT_NULL, 'require', 'check']);
const HOOK_NAME = /^use[A-Z]/u;
const GETTER_PREFIX = /^(?:get|is|has)(?=[A-Z])/u;

function normalized(name: string): string {
  return name.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
}

const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+/u;

function headWord(name: string): string {
  return (name.split(WORD_BREAK).at(-1) ?? '').toLowerCase().replace(/s$/u, '');
}

function initialsOf(name: string): string {
  return name
    .split(WORD_BREAK)
    .map((word) => word.charAt(0).toLowerCase())
    .join('');
}

function describes(checkedName: string, word: string): boolean {
  return headWord(checkedName) === headWord(word) || normalized(checkedName) === initialsOf(word);
}

function checkedIdentifiers(source: BareSource, range: Span): string[] {
  return source.tokens
    .slice(range.from, range.to)
    .filter(({ kind }) => kind === 'identifier')
    .map(({ text }) => text);
}

function checkedNames(source: BareSource, range: Span): Set<string> {
  const names = new Set<string>();
  for (const token of source.tokens.slice(range.from, range.to)) {
    if (token.kind === 'identifier') {
      names.add(normalized(token.text));
      names.add(normalized(token.text.replace(GETTER_PREFIX, '')));
    }
  }
  return names;
}

function messageOf(source: BareSource, call: TokenCall): string | undefined {
  const { tokens } = source;
  const second = call.args[1];
  if (second !== undefined && second.to - second.from === 1) {
    return literalText(tokens[second.from]);
  }
  const lambda = tokens[call.close + 1]?.text === '{' ? call.close + 2 : -1;
  return lambda !== -1 && tokens[lambda]?.kind === 'string'
    ? literalText(tokens[lambda])
    : undefined;
}

function isPrecondition(source: BareSource, call: TokenCall): boolean {
  const { tokens } = source;
  const known = VALUE_CHECKS.has(call.name) || CONDITION_CHECKS.has(call.name);
  if (call.receiver === undefined) {
    return known && (source.kotlin ? BARE_KOTLIN : BARE_JAVA).has(call.name);
  }
  return known && OWNERS.has(tokens[call.receiver.to - 1]?.text ?? '');
}

function messageWords(message: string): Set<string> {
  return new Set(message.split(/[^\w$]+/u).map((word) => normalized(word)));
}

function candidates(message: string): string[] {
  const word = ELEMENT_CHECK.test(message) ? undefined : SUBJECT.exec(message.trim())?.[1];
  return word === undefined ? [] : [word, word.charAt(0).toLowerCase() + word.slice(1)];
}

export function findMismatchedPreconditions(source: SourceFile): MinedItem[] {
  const scopeNames = scopeNamesOf(source);
  return methodCalls(source).flatMap((call) => {
    const [subject] = call.args;
    const message = messageOf(source, call);
    if (subject === undefined || message === undefined || !isPrecondition(source, call)) {
      return [];
    }
    const checked = checkedNames(source, subject);
    const named = candidates(message);
    const identifiers = checkedIdentifiers(source, subject);
    const describing = named.some((word) => identifiers.some((name) => describes(name, word)));
    if (
      named.length === 0 ||
      checked.size === 0 ||
      describing ||
      named.some((name) => checked.has(normalized(name)))
    ) {
      return [];
    }
    const found = named.find((name) => !HOOK_NAME.test(name) && scopeNames(call.index).has(name));
    const words = messageWords(message);
    const redundant =
      found !== undefined &&
      identifiers.some(
        (name) =>
          words.has(normalized(name)) || isDerivedFrom(source, { checked: name, named: found }),
      );
    return found === undefined || redundant
      ? []
      : [
          {
            line: call.line,
            symbol: found,
            key: shortText(textOf(source, subject)),
            checked: shortText(textOf(source, subject)),
            named: found,
          },
        ];
  });
}

function messageFor({ checked, named }: { checked: string; named: string }): string {
  return (
    `The check is on \`${checked}\` but its message names \`${named}\`, so a failure points at the wrong value. ` +
    `Check \`${named}\`, or change the message to name \`${checked}\`.`
  );
}

export const preconditionMessageRule: MinedRule = {
  id: PRECONDITION_MESSAGE_RULE,
  find: findMismatchedPreconditions,
  message: ({ checked = '', named = '' }) => messageFor({ checked, named }),
};

export const PRECONDITION_MESSAGE_ALLOWED = messageFor({ checked: '<value>', named: '<name>' });
