import { frameAt } from '../../max-value-sums/source-file.mts';
import type { BareSource, SourceFile, Span } from '../../max-value-sums/sum-types.mts';
import type { Token } from '../../../reuse/jvm-reuse-types.mts';
import { isDiagnosticText, numericNames } from './context.mts';
import { isOperator, methodCalls, stringValue } from '../calls.mts';
import type { MethodCall } from '../calls.mts';

export type MarkupHit = {
  readonly line: number;
  readonly value: string;
  readonly owner: string | undefined;
};

type Numbers = ReadonlySet<string>;
type MarkupState = { readonly seen: Set<number>; readonly numbers: Numbers };
type Concatenation = { readonly span: Span; readonly bad: Span };

const TAGS =
  'a|b|body|br|button|code|div|em|form|h[1-6]|head|hr|html|i|iframe|img|input|label|li|link|meta|ol|' +
  'option|p|pre|script|section|select|small|span|strong|style|svg|table|tbody|td|textarea|th|thead|' +
  'title|tr|u|ul';
const MARKUP = new RegExp(`(?<![\\w)\\]])</?(?:${TAGS})(?=[\\s>/]|$|\\\\)`, 'u');
const SAFE = /escape|encode|sanitize|html|quote|clean/iu;
const NUMBERS = /^(?:length|size|count|toInt|toLong|ordinal)$/u;
const TEMPLATE_PART = /\$\{([^}]*)\}|\$([\p{L}_][\p{L}\p{N}_]*)/gu;
const MAX_VALUE_LENGTH = 40;
const STOPS = new Set([',', ';', '=', 'return', '{', '}']);
const TEXT_VERBS = /%(?:\d+\$)?[-+# ,(\d]*(?:\.\d+)?([a-zA-Z%])/gu;

function isMarkupToken(token: Token | undefined): token is Token {
  return token !== undefined && token.kind === 'string' && MARKUP.test(token.text);
}

function isSafeTokens(tokens: readonly Token[], numbers: Numbers): boolean {
  const words = tokens.map(({ text }) => text);
  const only = tokens.length === 1 ? tokens[0] : undefined;
  if (only !== undefined && (['number', 'char'].includes(only.kind) || numbers.has(only.text))) {
    return true;
  }
  if (only?.kind === 'string') {
    return (only.names?.length ?? 0) === 0;
  }
  return words.some((word) => SAFE.test(word) || NUMBERS.test(word));
}

function operandsOf(source: BareSource, { from, to }: Span): Span[] {
  const operands: Span[] = [];
  let start = from;
  let resume = from;
  const { tokens, partner } = source;
  for (const [offset, token] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    if (index < resume) {
      continue;
    }
    if (isOperator(token, ['+']) && !tokens[index + 1]?.text.startsWith('+')) {
      operands.push({ from: start, to: index });
      start = index + 1;
    } else if ((partner[index] ?? -1) > index) {
      resume = (partner[index] ?? -1) + 1;
    }
  }
  return [...operands, { from: start, to }];
}

function expressionAround(source: BareSource, index: number): Span {
  const { tokens, opener, partner } = source;
  const boundary = opener[index] ?? -1;
  const from = boundary + 1;
  const closing = boundary >= 0 ? (partner[boundary] ?? -1) : -1;
  const to = closing > boundary ? closing : tokens.length;
  function isStop(at: number): boolean {
    return STOPS.has(tokens[at]?.text ?? '') && opener[at] === boundary;
  }
  const before = tokens.slice(from, index).findLastIndex((_, offset) => isStop(from + offset));
  const after = tokens.slice(index + 1, to).findIndex((_, offset) => isStop(index + 1 + offset));
  return {
    from: before === -1 ? Math.min(from, index) : from + before + 1,
    to: after === -1 ? Math.max(to, index + 1) : index + 1 + after,
  };
}

function concatenationFinding(
  source: BareSource,
  index: number,
  numbers: Numbers,
): Concatenation | undefined {
  const span = expressionAround(source, index);
  const operands = operandsOf(source, span);
  if (
    operands.length < 2 ||
    !operands.some(({ from, to }) => to - from === 1 && isMarkupToken(source.tokens[from]))
  ) {
    return undefined;
  }
  const bad = operands.find(
    (operand) =>
      !isSafeTokens(source.tokens.slice(operand.from, operand.to), numbers) &&
      operand.to - operand.from > 0,
  );
  return bad === undefined ? undefined : { span, bad };
}

function lastSegment(code: string): string {
  return code.trim().replace(/\(\)$/u, '').split(/\??\./u).pop() ?? '';
}

function templateFinding(token: Token | undefined, numbers: Numbers): string | undefined {
  if (!isMarkupToken(token) || (token.names?.length ?? 0) === 0) {
    return undefined;
  }
  const parts = [...token.text.matchAll(TEMPLATE_PART)];
  const bad = parts.find(
    ([, code = '', name]) =>
      !numbers.has(name ?? code.trim()) &&
      (name !== undefined || !(SAFE.test(code) || NUMBERS.test(lastSegment(code)))),
  );
  return bad === undefined ? undefined : (bad[1] ?? bad[2]);
}

function formatFindings(
  source: BareSource,
  call: MethodCall,
  numbers: Numbers,
): { line: number; value: string }[] {
  const [format, ...values] = call.args;
  const token = format === undefined ? undefined : source.tokens[format.from];
  const direct =
    call.name === 'format' &&
    format !== undefined &&
    token?.kind === 'string' &&
    format.to - format.from === 1;
  const owner = source.tokens[call.dot - 1];
  const formatted = call.name === 'formatted' && owner?.kind === 'string';
  const pattern = [direct ? token : undefined, formatted ? owner : undefined].find(
    (item) => item !== undefined,
  );
  const list = direct ? values : call.args;
  if (pattern === undefined || !isMarkupToken(pattern)) {
    return [];
  }
  const verbs = [...(stringValue(pattern) ?? '').matchAll(TEXT_VERBS)].filter(
    ([, verb]) => verb !== '%' && verb !== 'n',
  );
  return verbs.flatMap(([, verb], position) => {
    const argument = list[position];
    const tokens = argument === undefined ? [] : source.tokens.slice(argument.from, argument.to);
    return argument !== undefined &&
      verb !== undefined &&
      'sS'.includes(verb) &&
      !isSafeTokens(tokens, numbers)
      ? [
          {
            line: call.line,
            value: tokens
              .map(({ text }) => text)
              .join('')
              .slice(0, MAX_VALUE_LENGTH),
          },
        ]
      : [];
  });
}

function ownerAt(source: SourceFile, at: number): string | undefined {
  return frameAt(source, at)?.name;
}

function markupFindings(
  source: SourceFile,
  index: number,
  { seen, numbers }: MarkupState,
): MarkupHit[] {
  const token = source.tokens[index];
  const owner = ownerAt(source, index);
  const found: MarkupHit[] = [];
  if (token === undefined) {
    return found;
  }
  const template = source.kotlin ? templateFinding(token, numbers) : undefined;
  if (template !== undefined) {
    found.push({ line: token.line, value: template.slice(0, MAX_VALUE_LENGTH), owner });
  }
  const concat = concatenationFinding(source, index, numbers);
  if (concat !== undefined && !seen.has(concat.span.from)) {
    seen.add(concat.span.from);
    const words = source.tokens.slice(concat.bad.from, concat.bad.to).map(({ text }) => text);
    found.push({ line: token.line, value: words.join('').slice(0, MAX_VALUE_LENGTH), owner });
  }
  return found;
}

function formatMarkup(source: SourceFile, numbers: Numbers): MarkupHit[] {
  return methodCalls(source, ['format', 'formatted'])
    .filter((call) => !isDiagnosticText(source, call.open))
    .flatMap((call) =>
      formatFindings(source, call, numbers).map((hit) => ({
        ...hit,
        owner: ownerAt(source, call.open),
      })),
    );
}

export function findUnescapedMarkup(source: SourceFile): MarkupHit[] {
  const state: MarkupState = { seen: new Set<number>(), numbers: numericNames(source) };
  const candidates = [...source.tokens.entries()].filter(
    ([index, token]) =>
      token.kind === 'string' && isMarkupToken(token) && !isDiagnosticText(source, index),
  );
  const found = candidates.flatMap(([index]) => markupFindings(source, index, state));
  return [...found, ...formatMarkup(source, state.numbers)];
}
