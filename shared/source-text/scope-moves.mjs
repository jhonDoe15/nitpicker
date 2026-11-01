import { DEDENT, INDENT, NEWLINE } from './layout-tokens.mjs';
import { alignTokens } from './token-alignment.mjs';

const SCOPE_SEPARATOR = '\u0003';
const PYTHON_SCOPES = new Set(['def', 'class', 'async']);
const HEADER_END = new Set(['(', ':', '[', NEWLINE]);
const MAX_LINE_EDITS = 1000;

function describe(lines, token, { scope, level }) {
  const known = lines[token.line];
  if (known === undefined || level > known.level) {
    lines[token.line] = { scope, level, tokens: known?.tokens ?? [] };
  }
  lines[token.line].tokens.push(token.text);
}

function pythonHeader(tokens, start) {
  if (!PYTHON_SCOPES.has(tokens[start].text)) {
    return undefined;
  }
  const end = tokens.findIndex((token, index) => index > start && HEADER_END.has(token.text));
  return tokens
    .slice(start, end === -1 ? tokens.length : end)
    .map(({ text }) => text)
    .join(' ');
}

function pythonStep(state, tokens, index) {
  const token = tokens[index];
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

function braceStep(state, token) {
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

export function describeLines(tokens, language) {
  const state = { stack: [], header: [], lines: [], lineStart: true };
  for (const index of tokens.keys()) {
    if (language.name === 'python') {
      pythonStep(state, tokens, index);
    } else {
      braceStep(state, tokens[index]);
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

function linesByScope(lines) {
  const byScope = new Map();
  for (const [line, described] of lines.entries()) {
    if (described !== undefined && !byScope.has(described.scope)) {
      byScope.set(described.scope, []);
    }
    byScope.get(described?.scope)?.push(line);
  }
  return byScope;
}

function splitAt(lines, anchors) {
  const gaps = [[]];
  for (const line of lines) {
    if (anchors.has(line)) {
      gaps.push([]);
    } else {
      gaps.at(-1).push(line);
    }
  }
  return gaps;
}

function keysOf(side, lines) {
  return lines.map((line) => side[line].key);
}

function matchScope(moved, { baseLines, headLines, context }) {
  const { sides, inBase, inHead, anchorOf } = context;
  const inScope = new Set(headLines);
  const anchors = baseLines.filter((line) => !inBase.has(line) && inScope.has(anchorOf(line)));
  const headGaps = splitAt(headLines, new Set(anchors.map(anchorOf)));
  for (const [index, gap] of splitAt(baseLines, new Set(anchors)).entries()) {
    const left = gap.filter((line) => inBase.has(line));
    const right = headGaps[index].filter((line) => inHead.has(line));
    for (const [leftIndex, rightIndex] of alignTokens(
      keysOf(sides.base, left),
      keysOf(sides.head, right),
      MAX_LINE_EDITS,
    ) ?? []) {
      moved.set(right[rightIndex], left[leftIndex]);
    }
  }
}

export function movedLines(context) {
  const { sides, inHead } = context;
  const baseByScope = linesByScope(sides.base);
  const headByScope = linesByScope(sides.head);
  const moved = new Map();
  const scopes = new Set([...inHead].map((line) => sides.head[line]?.scope));
  for (const scope of scopes) {
    if (baseByScope.has(scope)) {
      matchScope(moved, {
        baseLines: baseByScope.get(scope),
        headLines: headByScope.get(scope),
        context,
      });
    }
  }
  return moved;
}
