import { frameAt } from '../../max-value-sums/source-file.mts';
import type { BareSource, SourceFile, Span } from '../../max-value-sums/sum-types.mts';
import type { Token } from '../../../reuse/jvm-reuse-types.mts';
import { numericNames } from '../html/context.mts';
import { isOperator, methodCalls, stringValue } from '../calls.mts';
import type { MethodCall } from '../calls.mts';

export type ReplacementHit = {
  readonly line: number;
  readonly method: string;
  readonly value: string;
  readonly owner: string | undefined;
};

type Names = ReadonlySet<string>;

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/u;
const SAFE_NAME = /quoteReplacement|escapeReplacement|escape|quote/iu;
const REGEX = 'Regex';
const REPLACE_FIRST = 'replaceFirst';
const REGEX_ENTRY = new Set([REGEX, 'toRegex']);
const SHAPED_LENGTH = 4;
const METHOD_FROM_END = -3;
const DOT_FROM_END = -4;
const OPEN_FROM_END = -2;
const VALUE_LENGTH = 40;
const SCAN_AHEAD = 14;

function isLiteralArgument(source: BareSource, { from, to }: Span): boolean {
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

function isFunctionArgument(source: BareSource, { from, to }: Span): boolean {
  return source.tokens
    .slice(from, to)
    .some((token) => isOperator(token, ['->', '::', '{']) || token.text === 'fun');
}

function isQuoted(source: BareSource, { from, to }: Span): boolean {
  return source.tokens.slice(from, to).some((token) => SAFE_NAME.test(token.text));
}

function isEnumText(source: BareSource, { from, to }: Span): boolean {
  const { tokens } = source;
  const call = tokens.slice(from, to);
  const last = call.at(METHOD_FROM_END)?.text;
  const shaped =
    call.length >= SHAPED_LENGTH &&
    call.at(DOT_FROM_END)?.text === '.' &&
    call.at(OPEN_FROM_END)?.text === '(';
  const enumFile = tokens.some(({ text }) => text === 'enum');
  return shaped && (last === 'name' || (enumFile && ['value', 'getValue'].includes(last ?? '')));
}

const TEMPLATE_NAME = /\$\{\s*(\w+)\s*\}|\$(\w+)/gu;

function isPlainToken(token: Token | undefined, numbers: Names): boolean {
  return (
    token !== undefined &&
    (['number', 'char'].includes(token.kind) ||
      numbers.has(token.text) ||
      stringValue(token) !== undefined)
  );
}

function isNumericFormat(source: BareSource, target: Span): boolean {
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
    (names?.length ?? 0) > 0 &&
    only !== undefined &&
    [...only.text.matchAll(TEMPLATE_NAME)].every(([, braced, bare]) =>
      numbers.has(braced ?? bare ?? ''),
    )
  );
}

function regexNames(source: BareSource): Set<string> {
  const { tokens } = source;
  const names = new Set<string>();
  for (const [index, token] of tokens.entries()) {
    const next = tokens[index + 1];
    const typed =
      token.kind === 'identifier' && next?.text === ':' && tokens[index + 2]?.text === REGEX;
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

function receiverText(source: BareSource, call: MethodCall): string {
  const before = source.tokens[call.dot - 1];
  return before?.kind === 'identifier' ? before.text : '';
}

function isMatcherReceiver(source: BareSource, call: MethodCall): boolean {
  const { tokens, partner } = source;
  const before = tokens[call.dot - 1];
  if (before?.kind === 'identifier') {
    return /matcher/iu.test(before.text);
  }
  const open = isOperator(before, [')']) ? (partner[call.dot - 1] ?? -1) : -1;
  return open > 0 && tokens[open - 1]?.text === 'matcher';
}

function kotlinRegexArgument(source: BareSource, names: Names, { from, to }: Span): boolean {
  const first = source.tokens.slice(from, to);
  const direct = first[0]?.text === REGEX || first.some((token) => token.text === 'toRegex');
  return direct || (first.length === 1 && names.has(first[0]?.text ?? ''));
}

function javaTargets(source: BareSource, call: MethodCall): Span | undefined {
  const { name, args } = call;
  if (args.length === 2 && (name === 'replaceAll' || name === REPLACE_FIRST)) {
    return args[1];
  }
  return args.length === 1 && name !== REPLACE_FIRST && isMatcherReceiver(source, call)
    ? args[0]
    : undefined;
}

function kotlinTargets(source: BareSource, names: Names, call: MethodCall): Span | undefined {
  const { name, args } = call;
  const [pattern, replacement] = args;
  if (name !== 'replace' && name !== REPLACE_FIRST) {
    return undefined;
  }
  if (args.length === 2 && pattern !== undefined && kotlinRegexArgument(source, names, pattern)) {
    return replacement;
  }
  return args.length === 2 && names.has(receiverText(source, call)) ? replacement : undefined;
}

export function findExpandingReplacements(source: SourceFile): ReplacementHit[] {
  const names = source.kotlin ? regexNames(source) : new Set<string>();
  return methodCalls(source, ['replaceAll', REPLACE_FIRST, 'replace']).flatMap((call) => {
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
        value: text.slice(0, VALUE_LENGTH),
        owner: frameAt(source, call.open)?.name,
      },
    ];
  });
}
