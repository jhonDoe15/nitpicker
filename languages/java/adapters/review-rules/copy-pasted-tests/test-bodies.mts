import type { Token } from '../../reuse/jvm-reuse-types.mts';

export type TestBody = {
  readonly name: string;
  readonly line: number;
  readonly parent: number;
  readonly shape: string;
};

type Range = { readonly from: number; readonly to: number };
type Found = {
  readonly name: string;
  readonly line: number;
  readonly body: Range;
  readonly marks?: Range;
};
type Layout = {
  readonly close: ReadonlyMap<number, number>;
  readonly depth: readonly number[];
  readonly covered: ReadonlySet<number>;
};

const LITERAL_KINDS = new Set(['string', 'number', 'char']);
const LITERAL_WORDS = new Set(['true', 'false', 'null']);
const VALUE_KINDS = new Set(['identifier', 'number', 'string', 'char']);
const CLOSES_VALUE = new Set([')', ']']);
const KOTEST_BUILDERS = new Set(['test', 'it', 'should', 'xtest', 'xit', 'xshould']);
const BOUNDARIES = new Set(['{', '}', ';']);
const BODY_STARTS = new Set(['{', '=', ';']);
const MEMBER_STARTS = new Set(['@', 'fun', 'private', 'internal', 'public', 'protected']);
const PARAMETERIZED_ARGUMENTS = new Set(['dataProvider', 'dataProviderClass']);
const OPENERS = new Set(['(', '{', '[']);
const CLOSERS = new Set([')', '}', ']']);
const CALL_NAME_OFFSET = 2;
const CALL_CLOSE_OFFSET = 3;
const CALL_OPEN_OFFSET = 4;

function annotated(tokens: readonly Token[], close: ReadonlyMap<number, number>): Set<number> {
  const spans = tokens.flatMap((token, at) =>
    token.text === '@' ? [[at, annotationEnd(tokens, { close }, at)] as const] : [],
  );
  return new Set(
    spans.flatMap(([from, to]) => Array.from({ length: to - from }, (_, k) => from + k)),
  );
}

function layoutOf(tokens: readonly Token[]): Layout {
  const stack: number[] = [];
  const close = new Map<number, number>();
  const depth: number[] = [];
  for (const [at, token] of tokens.entries()) {
    if (CLOSERS.has(token.text)) {
      const open = stack.pop();
      if (open !== undefined) {
        close.set(open, at);
      }
    }
    depth.push(stack.length);
    if (OPENERS.has(token.text)) {
      stack.push(at);
    }
  }
  return { close, depth, covered: annotated(tokens, close) };
}

function isNegation(tokens: readonly Token[], at: number): boolean {
  const before = tokens[at - 1];
  return (
    tokens[at]?.text === '-' &&
    tokens[at + 1]?.kind === 'number' &&
    !(before !== undefined && (VALUE_KINDS.has(before.kind) || CLOSES_VALUE.has(before.text)))
  );
}

function shapeOf(tokens: readonly Token[], { from, to }: Range): string {
  return tokens
    .slice(from, to)
    .flatMap((token, offset) => {
      if (isNegation(tokens, from + offset)) {
        return [];
      }
      return [
        LITERAL_KINDS.has(token.kind) || LITERAL_WORDS.has(token.text) ? '<lit>' : token.text,
      ];
    })
    .join(' ');
}

function marksOf(tokens: readonly Token[], range: Range | undefined): string {
  if (range === undefined) {
    return '';
  }
  const starts = tokens.flatMap((token, at) =>
    at >= range.from && at < range.to && token.text === '@' ? [at] : [],
  );
  return starts
    .flatMap((from, index) => {
      const to = starts[index + 1] ?? range.to;
      return tokens[from + 1]?.text === 'DisplayName' ? [] : [shapeOf(tokens, { from, to })];
    })
    .join(' ');
}

function expressionEnd(tokens: readonly Token[], layout: Layout, from: number): number {
  const level = layout.depth[from] ?? 0;
  const end = tokens.findIndex((token, at) => {
    const previous = tokens[at - 1];
    const newMember =
      layout.depth[at] === level &&
      previous !== undefined &&
      token.line > previous.line &&
      MEMBER_STARTS.has(token.text);
    return at > from && ((layout.depth[at] ?? 0) < level || newMember);
  });
  return end === -1 ? tokens.length : end;
}

function dottedEnd(tokens: readonly Token[], at: number): number {
  const first = at + CALL_NAME_OFFSET;
  const end = tokens.findIndex(
    (token, index) =>
      index >= first &&
      (index - first) % CALL_NAME_OFFSET === 0 &&
      !(token.text === '.' && tokens[index + 1]?.kind === 'identifier'),
  );
  return end === -1 ? tokens.length : end;
}

function annotationEnd(
  tokens: readonly Token[],
  layout: Pick<Layout, 'close'>,
  at: number,
): number {
  const end = dottedEnd(tokens, at);
  const close = tokens[end]?.text === '(' ? layout.close.get(end) : undefined;
  return close === undefined ? end : close + 1;
}

function isTestAnnotation(tokens: readonly Token[], layout: Layout, at: number): boolean {
  const end = annotationEnd(tokens, layout, at);
  const annotation = tokens.slice(at, end);
  const parameterized = annotation.some((token) => PARAMETERIZED_ARGUMENTS.has(token.text));
  const name = annotation.findIndex((token) => token.text === '(');
  const last = annotation.at(name === -1 ? -1 : name - 1);
  return last?.text === 'Test' && !parameterized && tokens[at - 1]?.kind !== 'identifier';
}

function afterAnnotations(tokens: readonly Token[], layout: Layout, from: number): number {
  const next = tokens.findIndex((_, at) => at >= from && !layout.covered.has(at));
  return next === -1 ? tokens.length : next;
}

function methodOf(tokens: readonly Token[], layout: Layout, annotation: number): Found | undefined {
  const start = afterAnnotations(tokens, layout, annotation);
  const parameters = tokens.findIndex(
    (token, at) => at >= start && (token.text === '(' || BOUNDARIES.has(token.text)),
  );
  const nameToken = tokens[parameters - 1];
  const afterParameters = (layout.close.get(parameters) ?? parameters) + 1;
  const open = tokens.findIndex(
    (token, at) => at >= afterParameters && BODY_STARTS.has(token.text),
  );
  const opener = tokens[open];
  if (tokens[parameters]?.text !== '(' || nameToken === undefined || opener === undefined) {
    return undefined;
  }
  const body =
    opener.text === '{'
      ? { from: open + 1, to: layout.close.get(open) ?? open + 1 }
      : { from: open + 1, to: expressionEnd(tokens, layout, open + 1) };
  const first = tokens.findLastIndex((_, at) => at < annotation && !layout.covered.has(at)) + 1;
  const marks = { from: first, to: start };
  return opener.text === ';'
    ? undefined
    : { name: nameToken.text, line: nameToken.line, body, marks };
}

function startsStatement(tokens: readonly Token[], at: number): boolean {
  const before = tokens[at - 1];
  return (
    before === undefined || BOUNDARIES.has(before.text) || before.line < (tokens[at]?.line ?? 0)
  );
}

function isKotestCall(tokens: readonly Token[], at: number): boolean {
  return (
    KOTEST_BUILDERS.has(tokens[at]?.text ?? '') &&
    tokens[at + 1]?.text === '(' &&
    tokens[at + CALL_NAME_OFFSET]?.kind === 'string' &&
    tokens[at + CALL_CLOSE_OFFSET]?.text === ')' &&
    tokens[at + CALL_OPEN_OFFSET]?.text === '{'
  );
}

function kotestAt(tokens: readonly Token[], layout: Layout, at: number): Found | undefined {
  const token = tokens[at];
  const call = isKotestCall(tokens, at);
  const named = token?.kind === 'string' && tokens[at + 1]?.text === '{';
  const open = call ? at + CALL_OPEN_OFFSET : at + 1;
  const label = call ? tokens[at + CALL_NAME_OFFSET] : token;
  if (
    token === undefined ||
    label === undefined ||
    !(call || named) ||
    !startsStatement(tokens, at)
  ) {
    return undefined;
  }
  return {
    name: label.text.replaceAll('"', ''),
    line: token.line,
    body: { from: open + 1, to: layout.close.get(open) ?? open + 1 },
  };
}

function enclosingBlock(tokens: readonly Token[], layout: Layout, at: number): number {
  return tokens.findLastIndex(
    (token, index) => index < at && token.text === '{' && (layout.close.get(index) ?? 0) > at,
  );
}

export function testBodies(tokens: readonly Token[], { kotlin }: { kotlin: boolean }): TestBody[] {
  const layout = layoutOf(tokens);
  return tokens.flatMap((token, at) => {
    const method =
      token.text === '@' && isTestAnnotation(tokens, layout, at)
        ? methodOf(tokens, layout, at)
        : undefined;
    const test = method ?? (kotlin ? kotestAt(tokens, layout, at) : undefined);
    return test === undefined
      ? []
      : [
          {
            name: test.name,
            line: test.line,
            parent: enclosingBlock(tokens, layout, at),
            shape: `${marksOf(tokens, test.marks)} | ${shapeOf(tokens, test.body)}`,
          },
        ];
  });
}
