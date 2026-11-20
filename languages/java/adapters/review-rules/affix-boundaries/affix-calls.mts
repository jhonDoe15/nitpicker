import {
  lastName,
  methodCalls,
  startOfStatement,
  endOfCondition,
  stringNames,
  stringValue,
  textOf,
  shortText,
} from '../token-calls/calls.mts';
import type { TokenCall } from '../token-calls/calls.mts';
import { endsWithBoundary, literalText, startsWithBoundary } from './boundaries.mts';
import {
  isDirectoryName,
  isHostName,
  isLocationName,
  isPrefixName,
  isStringCall,
} from './names.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { MinedItem } from '../review-types.mts';

type Found = { readonly call: TokenCall; readonly receiver: Span; readonly arg: Span };
type Kind = 'prefix' | 'suffix' | 'origin';

const ORIGIN_ONLY = /^https?:\/\/[^/]+$/iu;
const PATH_SHAPED = /^(?:[/~@]|[\w.-]+\/)/u;
const AFFIX_CALLS = new Set(['startsWith', 'endsWith']);
const WORD_LITERAL = /[\p{L}\p{N}]/u;
const LOOKAHEAD = 60;
const THIS_MEMBER_TOKENS = 3;

function isStringReceiver(
  source: BareSource,
  receiver: Span,
  strings: ReadonlySet<string>,
): boolean {
  const { tokens } = source;
  const last = tokens[receiver.to - 1]?.text ?? '';
  const member =
    receiver.to - receiver.from === THIS_MEMBER_TOKENS && tokens[receiver.from]?.text === 'this';
  const plain = receiver.to - receiver.from === 1 || member;
  if (plain) {
    return strings.has(last);
  }
  return last === ')' && isStringCall(lastName(source, receiver));
}

function plainLiteral(source: BareSource, range: Span): string | undefined {
  return source.tokens[range.from]?.names === undefined ? stringValue(source, range) : undefined;
}

function builtLiteral(source: BareSource, range: Span): string | undefined {
  const { tokens } = source;
  const first = tokens[range.from];
  const joined = range.to - range.from > 2 && tokens[range.from + 1]?.text === '+';
  const template = range.to - range.from === 1 && first?.names !== undefined;
  return joined || template ? literalText(first) : undefined;
}

function prefixKind(source: BareSource, { receiver, arg }: Found): Kind | undefined {
  const receiverName = lastName(source, receiver);
  const plain = plainLiteral(source, arg);
  if (plain !== undefined) {
    return ORIGIN_ONLY.test(plain) ? 'origin' : undefined;
  }
  const built = builtLiteral(source, arg);
  if (built !== undefined) {
    const pathLike = isLocationName(receiverName) && PATH_SHAPED.test(built);
    return pathLike && !endsWithBoundary(source, arg) ? 'prefix' : undefined;
  }
  const name = lastName(source, arg);
  const named = isDirectoryName(name) || (isPrefixName(name) && isLocationName(receiverName));
  return named && !endsWithBoundary(source, arg) ? 'prefix' : undefined;
}

function suffixKind(source: BareSource, { receiver, arg }: Found): Kind | undefined {
  const literal = plainLiteral(source, arg);
  if (literal !== undefined && !WORD_LITERAL.test(literal)) {
    return undefined;
  }
  const hostLike =
    isHostName(lastName(source, arg)) ||
    (isHostName(lastName(source, receiver)) && plainLiteral(source, arg) !== undefined);
  return hostLike && !startsWithBoundary(source, arg) ? 'suffix' : undefined;
}

const KINDS: Readonly<Record<string, (source: BareSource, found: Found) => Kind | undefined>> = {
  startsWith: prefixKind,
  endsWith: suffixKind,
};

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function checksLength(source: BareSource, { call, receiver, arg }: Found): boolean {
  const from = startOfStatement(source, receiver.from);
  const window = textOf(source, {
    from,
    to: Math.min(source.tokens.length, call.close + LOOKAHEAD),
  });
  const length = escaped(`${textOf(source, arg)}.length`);
  const own = escaped(`${textOf(source, receiver)}.length`);
  const forms = [
    `(?:charAt|get|at)\\(${length}`,
    `\\[${length}`,
    `${own}(?:\\(\\))?[=!<>]+${length}`,
  ];
  return new RegExp(forms.join('|'), 'u').test(window);
}

function isGuarded(source: BareSource, calls: TokenCall[], found: Found): boolean {
  const { call, receiver, arg } = found;
  const from = startOfStatement(source, receiver.from);
  const to = endOfCondition(source, call.close);
  const span = textOf(source, { from, to });
  const r = textOf(source, receiver);
  const a = textOf(source, arg);
  const equal = [`${r}.equals(${a})`, `${a}.equals(${r})`, `${r}==${a}`, `${a}==${r}`];
  if (equal.some((form) => span.includes(form))) {
    return true;
  }
  if (checksLength(source, found)) {
    return true;
  }
  const leading = calls.some(
    ({ name, index, receiver: other, args }) =>
      name === 'startsWith' &&
      index >= from &&
      index < to &&
      other !== undefined &&
      textOf(source, other) === a &&
      args.length === 1 &&
      args[0] !== undefined &&
      startsWithBoundary(source, args[0]),
  );
  return (
    leading ||
    calls.some(
      ({ index, receiver: other, args }) =>
        index !== call.index &&
        index >= from &&
        index < to &&
        other !== undefined &&
        textOf(source, other) === r &&
        args.length === 1 &&
        args[0] !== undefined &&
        textOf(source, args[0]).includes(a) &&
        endsWithBoundary(source, args[0]),
    )
  );
}

export function findAffixChecks(source: SourceFile): MinedItem[] {
  const calls = methodCalls(source);
  const strings = stringNames(source);
  return calls.flatMap((call) => {
    const [arg] = call.args;
    const { receiver } = call;
    if (
      !AFFIX_CALLS.has(call.name) ||
      receiver === undefined ||
      arg === undefined ||
      call.args.length !== 1
    ) {
      return [];
    }
    if (!isStringReceiver(source, receiver, strings)) {
      return [];
    }
    const found = { call, receiver, arg };
    const kind = KINDS[call.name]?.(source, found);
    return kind === undefined || isGuarded(source, calls, found)
      ? []
      : [
          {
            line: call.line,
            kind,
            symbol: call.name,
            key: shortText(textOf(source, { from: receiver.from, to: call.close + 1 })),
          },
        ];
  });
}
