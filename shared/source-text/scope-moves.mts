import { DEDENT, INDENT, NEWLINE } from './layout-tokens.mts';
import { alignTokens } from './token-alignment.mts';
import type {
  DescribedLine,
  DescribeState,
  LineDescription,
  MovedContext,
  Token,
} from './typed/source-types.mts';

const SCOPE_SEPARATOR = '\u0003';
const PYTHON_SCOPES = new Set(['def', 'class', 'async']);
const HEADER_END = new Set(['(', ':', '[', NEWLINE]);
const MAX_LINE_EDITS = 1000;

function describe(
  lines: LineDescription[],
  token: Token,
  { scope, level }: { readonly scope: string; readonly level: number },
): void {
  const known = lines[token.line];
  const current =
    known === undefined || level > known.level
      ? { scope, level, tokens: known?.tokens ?? [] }
      : known;
  lines[token.line] = current;
  current.tokens.push(token.text);
}

function pythonHeader(tokens: readonly Token[], start: number): string | undefined {
  const first = tokens[start];
  if (first === undefined || !PYTHON_SCOPES.has(first.text)) {
    return undefined;
  }
  const end = tokens.findIndex((token, index) => index > start && HEADER_END.has(token.text));
  return tokens
    .slice(start, end === -1 ? tokens.length : end)
    .map(({ text }) => text)
    .join(' ');
}

function pythonStep(
  state: DescribeState,
  { tokens, token, index }: { tokens: readonly Token[]; token: Token; index: number },
): void {
  if (token.text === INDENT) {
    state.stack.push(state.pending ?? '');
    state.pending = undefined;
  }
  if (token.text === DEDENT) {
    state.stack.pop();
  }
  if (state.lineStart && token.kind !== 'comment' && token.kind !== 'layout') {
    state.lineStart = false;
    state.pending = pythonHeader(tokens, index);
  }
  state.lineStart ||= token.text === NEWLINE;
  const scope = [...state.stack, state.pending ?? ''].filter((key) => key !== '');
  describe(state.lines, token, { scope: scope.join(SCOPE_SEPARATOR), level: state.stack.length });
}

function braceStep(state: DescribeState, token: Token): void {
  const opens = token.kind === 'op' && token.text === '{';
  const closes = token.kind === 'op' && token.text === '}';
  if (opens) {
    state.stack.push(state.header.join(' '));
  }
  describe(state.lines, token, {
    scope: state.stack.join(SCOPE_SEPARATOR),
    level: state.stack.length,
  });
  if (closes) {
    state.stack.pop();
  }
  if (opens || closes || token.text === NEWLINE || token.text === ';') {
    state.header = [];
  } else if (token.kind !== 'comment') {
    state.header.push(token.text);
  }
}

export function describeLines(
  tokens: readonly Token[],
  language: { readonly name: string },
): DescribedLine[] {
  const state: DescribeState = {
    stack: [],
    header: [],
    lines: [],
    lineStart: true,
    pending: undefined,
  };
  for (const [index, token] of tokens.entries()) {
    if (language.name === 'python') {
      pythonStep(state, { tokens, token, index });
    } else {
      braceStep(state, token);
    }
  }
  return state.lines.map((line) => ({
    ...line,
    key: [
      String(line.level),
      ...line.tokens.filter((text) => text !== INDENT && text !== DEDENT),
    ].join('\0'),
  }));
}

function linesByScope(lines: readonly (DescribedLine | undefined)[]): Map<string, number[]> {
  const byScope = new Map<string, number[]>();
  for (const [line, described] of lines.entries()) {
    if (described === undefined) {
      continue;
    }
    if (!byScope.has(described.scope)) {
      byScope.set(described.scope, []);
    }
    byScope.get(described.scope)?.push(line);
  }
  return byScope;
}

function splitAt(lines: readonly number[], anchors: ReadonlySet<number>): number[][] {
  const gaps: number[][] = [[]];
  for (const line of lines) {
    if (anchors.has(line)) {
      gaps.push([]);
    } else {
      gaps.at(-1)?.push(line);
    }
  }
  return gaps;
}

function keysOf(side: readonly (DescribedLine | undefined)[], lines: readonly number[]): string[] {
  return lines.map((line) => side[line]?.key ?? '');
}

function gapMoves({
  sides,
  left,
  right,
}: {
  readonly sides: MovedContext['sides'];
  readonly left: readonly number[];
  readonly right: readonly number[];
}): [number, number][] {
  const pairs =
    alignTokens(keysOf(sides.base, left), keysOf(sides.head, right), MAX_LINE_EDITS) ?? [];
  return pairs.flatMap(([leftIndex, rightIndex]): [number, number][] => {
    const movedLine = right[rightIndex];
    const baseLine = left[leftIndex];
    return movedLine !== undefined && baseLine !== undefined ? [[movedLine, baseLine]] : [];
  });
}

function matchScope(
  moved: Map<number, number>,
  {
    baseLines,
    headLines,
    context,
  }: { readonly baseLines: number[]; readonly headLines: number[]; readonly context: MovedContext },
): void {
  const { sides, inBase, inHead, anchorOf } = context;
  const inScope = new Set(headLines);
  const anchors = baseLines.filter((line) => !inBase.has(line) && inScope.has(anchorOf(line)));
  const headGaps = splitAt(headLines, new Set(anchors.map(anchorOf)));
  for (const [index, gap] of splitAt(baseLines, new Set(anchors)).entries()) {
    const left = gap.filter((line) => inBase.has(line));
    const right = (headGaps[index] ?? []).filter((line) => inHead.has(line));
    for (const [movedLine, baseLine] of gapMoves({ sides, left, right })) {
      moved.set(movedLine, baseLine);
    }
  }
}

export function movedLines(context: MovedContext): Map<number, number> {
  const { sides, inHead } = context;
  const baseByScope = linesByScope(sides.base);
  const headByScope = linesByScope(sides.head);
  const moved = new Map<number, number>();
  const scopes = new Set([...inHead].flatMap((line) => sides.head[line]?.scope ?? []));
  for (const scope of scopes) {
    if (baseByScope.has(scope)) {
      matchScope(moved, {
        baseLines: baseByScope.get(scope) ?? [],
        headLines: headByScope.get(scope) ?? [],
        context,
      });
    }
  }
  return moved;
}
