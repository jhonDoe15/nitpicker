import { frameAt } from '../../max-value-sums/source-file.mjs';
import { numericNames } from '../html/context.mjs';
import { isOperator, methodCalls, stringValue } from '../calls.mjs';

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/u;
const SAFE_NAME = /quoteReplacement|escapeReplacement|escape|quote/iu;
const REGEX_ENTRY = new Set(['Regex', 'toRegex']);
const SCAN_AHEAD = 14;

function isLiteralArgument(source, { from, to }) {
  return source.tokens.slice(from, to).every((token) => {
    if (token.kind === 'string') {
      return stringValue(token) !== undefined || token.text.startsWith('"""');
    }
    return (
      isOperator(token, ['+', '.', '(', ')']) ||
      token.kind === 'number' ||
      (token.kind === 'identifier' &&
        (CONSTANT_NAME.test(token.text) || /^[A-Z]\w*$/u.test(token.text)))
    );
  });
}

function isFunctionArgument(source, { from, to }) {
  return source.tokens
    .slice(from, to)
    .some((token) => isOperator(token, ['->', '::', '{']) || token.text === 'fun');
}

function isQuoted(source, { from, to }) {
  return source.tokens.slice(from, to).some((token) => SAFE_NAME.test(token.text));
}

function isEnumText(source, { from, to }) {
  const { tokens } = source;
  const call = tokens.slice(from, to);
  const last = call.at(-3)?.text;
  const shaped = call.length >= 4 && call.at(-4)?.text === '.' && call.at(-2)?.text === '(';
  const enumFile = tokens.some(({ text }) => text === 'enum');
  return shaped && (last === 'name' || (enumFile && ['value', 'getValue'].includes(last)));
}

const TEMPLATE_NAME = /\$\{\s*(\w+)\s*\}|\$(\w+)/gu;

function isPlainToken(token, numbers) {
  return (
    ['number', 'char'].includes(token.kind) ||
    numbers.has(token.text) ||
    stringValue(token) !== undefined
  );
}

function isNumericFormat(source, target) {
  const { tokens } = source;
  const numbers = numericNames(source);
  const last = target.to - 1;
  const call = methodCalls(source, ['format', 'formatted']).find(
    ({ close, dot }) => close === last && dot >= target.from,
  );
  if (call !== undefined) {
    const values = call.name === 'format' ? call.args.slice(1) : call.args;
    return values.every(({ from, to }) => to - from === 1 && isPlainToken(tokens[from], numbers));
  }
  const [only] = tokens.slice(target.from, target.to);
  const names = only?.kind === 'string' && target.to - target.from === 1 ? only.names : undefined;
  return (
    names?.length > 0 &&
    [...only.text.matchAll(TEMPLATE_NAME)].every(([, braced, bare]) => numbers.has(braced ?? bare))
  );
}

function regexNames(source) {
  const { tokens } = source;
  const names = new Set();
  for (const [index, token] of tokens.entries()) {
    const next = tokens[index + 1];
    const typed =
      token.kind === 'identifier' && next?.text === ':' && tokens[index + 2]?.text === 'Regex';
    const assigned =
      token.kind === 'identifier' &&
      next?.text === '=' &&
      tokens
        .slice(index + 2, index + SCAN_AHEAD)
        .some(
          (later, offset, rest) => REGEX_ENTRY.has(later.text) && rest[offset + 1]?.text === '(',
        );
    if (typed || assigned) {
      names.add(token.text);
    }
  }
  return names;
}

function receiverText(source, call) {
  const before = source.tokens[call.dot - 1];
  return before?.kind === 'identifier' ? before.text : '';
}

function isMatcherReceiver(source, call) {
  const { tokens, partner } = source;
  const before = tokens[call.dot - 1];
  if (before?.kind === 'identifier') {
    return /matcher/iu.test(before.text);
  }
  const open = isOperator(before, [')']) ? partner[call.dot - 1] : -1;
  return open > 0 && tokens[open - 1]?.text === 'matcher';
}

function kotlinRegexArgument(source, names, { from, to }) {
  const first = source.tokens.slice(from, to);
  const direct = first[0]?.text === 'Regex' || first.some((token) => token.text === 'toRegex');
  return direct || (first.length === 1 && names.has(first[0].text));
}

function javaTargets(source, call) {
  const { name, args } = call;
  if (args.length === 2 && (name === 'replaceAll' || name === 'replaceFirst')) {
    return args[1];
  }
  return args.length === 1 && name !== 'replaceFirst' && isMatcherReceiver(source, call)
    ? args[0]
    : undefined;
}

function kotlinTargets(source, names, call) {
  const { name, args } = call;
  if (name === 'replace' || name === 'replaceFirst') {
    if (args.length === 2 && kotlinRegexArgument(source, names, args[0])) {
      return args[1];
    }
    return args.length === 2 && names.has(receiverText(source, call)) ? args[1] : undefined;
  }
  return undefined;
}

export function findExpandingReplacements(source) {
  const names = source.kotlin ? regexNames(source) : new Set();
  return methodCalls(source, ['replaceAll', 'replaceFirst', 'replace']).flatMap((call) => {
    const target = source.kotlin ? kotlinTargets(source, names, call) : javaTargets(source, call);
    if (
      target === undefined ||
      isLiteralArgument(source, target) ||
      isFunctionArgument(source, target) ||
      isQuoted(source, target) ||
      isEnumText(source, target) ||
      isNumericFormat(source, target)
    ) {
      return [];
    }
    const text = source.tokens
      .slice(target.from, target.to)
      .map(({ text: word }) => word)
      .join('');
    return [
      {
        line: call.line,
        method: call.name,
        value: text.slice(0, 40),
        owner: frameAt(source, call.open)?.name,
      },
    ];
  });
}
