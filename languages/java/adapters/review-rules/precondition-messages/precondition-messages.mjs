import { methodCalls, shortText, textOf } from '../token-calls/calls.mjs';
import { literalText } from '../affix-boundaries/boundaries.mjs';
import { isDerivedFrom, scopeNamesOf } from './scope-names.mjs';

export const PRECONDITION_MESSAGE_RULE = 'PreconditionMessageNamesOtherValue';
export const PRECONDITION_MESSAGE_EXCEPTION_RULE = `pmd/${PRECONDITION_MESSAGE_RULE}`;

const SUBJECT = new RegExp(
  '^[`\'"]?([A-Za-z_$][\\w$]*)[`\'"]?\\s+' +
    "(?:must|should|is|are|was|cannot|can't|can not|may not|has|have|required|needs|not)\\b",
  'iu',
);
const ELEMENT_CHECK = /\bcontain/iu;
const OWNERS = new Set(['Assert', 'Objects', 'Preconditions', 'Validate']);
const VALUE_CHECKS = new Set([
  'notNull',
  'hasText',
  'hasLength',
  'notEmpty',
  'notBlank',
  'noNullElements',
  'requireNonNull',
  'checkNotNull',
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
const BARE_JAVA = new Set(['requireNonNull', 'checkNotNull', 'checkArgument', 'checkState']);
const BARE_KOTLIN = new Set(['requireNotNull', 'checkNotNull', 'require', 'check']);
const HOOK_NAME = /^use[A-Z]/u;
const GETTER_PREFIX = /^(?:get|is|has)(?=[A-Z])/u;

function normalized(name) {
  return name.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
}

const WORD_BREAK = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-\s]+/u;

function headWord(name) {
  return name.split(WORD_BREAK).at(-1).toLowerCase().replace(/s$/u, '');
}

function initialsOf(name) {
  return name
    .split(WORD_BREAK)
    .map((word) => word.charAt(0).toLowerCase())
    .join('');
}

function describes(checkedName, word) {
  return headWord(checkedName) === headWord(word) || normalized(checkedName) === initialsOf(word);
}

function checkedIdentifiers(source, range) {
  return source.tokens
    .slice(range.from, range.to)
    .filter(({ kind }) => kind === 'identifier')
    .map(({ text }) => text);
}

function checkedNames(source, range) {
  const names = new Set();
  for (let index = range.from; index < range.to; index += 1) {
    const token = source.tokens[index];
    if (token.kind === 'identifier') {
      names.add(normalized(token.text));
      names.add(normalized(token.text.replace(GETTER_PREFIX, '')));
    }
  }
  return names;
}

function messageOf(source, call) {
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

function isPrecondition(source, call) {
  const { tokens } = source;
  const known = VALUE_CHECKS.has(call.name) || CONDITION_CHECKS.has(call.name);
  if (call.receiver === undefined) {
    return known && (source.kotlin ? BARE_KOTLIN : BARE_JAVA).has(call.name);
  }
  return known && OWNERS.has(tokens[call.receiver.to - 1]?.text);
}

function messageWords(message) {
  return new Set(message.split(/[^\w$]+/u).map((word) => normalized(word)));
}

function candidates(message) {
  const word = ELEMENT_CHECK.test(message) ? undefined : SUBJECT.exec(message.trim())?.[1];
  return word === undefined ? [] : [word, word.charAt(0).toLowerCase() + word.slice(1)];
}

export function findMismatchedPreconditions(source) {
  const scopeNames = scopeNamesOf(source);
  return methodCalls(source).flatMap((call) => {
    const [subject] = call.args;
    if (subject === undefined || !isPrecondition(source, call)) {
      return [];
    }
    const message = messageOf(source, call);
    const checked = checkedNames(source, subject);
    const named = message === undefined ? [] : candidates(message);
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

function messageFor({ checked, named }) {
  return (
    `The check is on \`${checked}\` but its message names \`${named}\`, so a failure points at the wrong value. ` +
    `Check \`${named}\`, or change the message to name \`${checked}\`.`
  );
}

export const preconditionMessageRule = {
  id: PRECONDITION_MESSAGE_RULE,
  find: findMismatchedPreconditions,
  message: (item) => messageFor(item),
};

export const PRECONDITION_MESSAGE_ALLOWED = messageFor({ checked: '<value>', named: '<name>' });
