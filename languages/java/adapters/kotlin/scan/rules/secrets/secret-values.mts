import type { IndexedScan, Literal } from '../../typed/scan-shapes.mts';

type Frame = {
  kind: string;
  valued: boolean;
  head?: string;
  name?: string | undefined;
  branches: boolean;
  lastArgument: boolean;
};
type Value = { parts: Literal[]; needsClose: boolean; dropped: boolean; closed: boolean };
type Chain = { value: Value; after: string };
type ValueState = {
  done: boolean;
  code: string;
  byStart: Map<number, Literal>;
  frames: Frame[];
  prev: string;
  found: Value[];
  skipUntil: number;
  closed?: Frame | undefined;
  chain?: Chain | undefined;
  name?: string;
};

const ROOT_FRAME: Frame = { kind: 'root', valued: true, branches: false, lastArgument: false };

function topOf(state: ValueState): Frame {
  return state.frames.at(-1) ?? ROOT_FRAME;
}
const TOKEN = /\?:|\?\.|->|[=!]=|[<>]=?|&&|\|\||!in\b|[A-Za-z_]\w*|[()[\]{},;\n+.="]/g;
const CONTINUED_LINE = /[ \t\r\n]*(?:\?:|\?\.|\.|\+|&&|\|\||else\b|->)/y;
const ONLY_ARGUMENT_CALLS = new Set(['orElse', 'valueOf', 'copyValueOf', 'String']);
const LAST_ARGUMENT_CALLS = new Set(['getOrDefault', 'getProperty', 'requireNonNullElse']);
const LAMBDA_CALLS = new Set(['lazy', 'getOrElse', 'getOrPut', 'orElseGet', 'run']);
const COMPARISONS = new Set(['==', '!=', '<', '>', '<=', '>=', 'in', '!in']);
const KEYWORDS = new Set(['else', 'if', 'when', 'while', 'for']);
const NOT_THE_VALUE = new Set([
  'equals',
  'equalsIgnoreCase',
  'contentEquals',
  'toRegex',
  'toPattern',
  'format',
  'startsWith',
  'endsWith',
  'contains',
  'matches',
]);
const VALUE_STARTS = new Set(['start', '(', '{', '?:', 'else', '->']);
const OPEN_ENDED = new Set([
  'start',
  '?:',
  'else',
  '->',
  '+',
  '=',
  '.',
  '?.',
  '&&',
  '||',
  'compare',
]);
const CLOSERS = new Set([')', ']', '}']);

function kindOf(text: string): string {
  if (COMPARISONS.has(text)) {
    return 'compare';
  }
  if (/^[A-Za-z_]/.test(text)) {
    return KEYWORDS.has(text) ? text : 'name';
  }
  return text === '"' ? 'quote' : text;
}

function followsIf(state: ValueState): boolean {
  return state.prev === ')' && state.closed?.head === 'if';
}

function opensValue(state: ValueState): boolean {
  const top = topOf(state);
  if (top.kind === 'when') {
    return top.branches && state.prev === '->';
  }
  if (top.lastArgument && state.prev === ',') {
    return true;
  }
  return top.valued && (VALUE_STARTS.has(state.prev) || followsIf(state));
}

function settleChain(state: ValueState, kind: string, text: string): void {
  const { chain } = state;
  if (chain === undefined || (kind === 'quote' && chain.after === '+')) {
    return;
  }
  const dropped = chain.after === '.' ? NOT_THE_VALUE.has(text) : kind === 'compare';
  chain.value.dropped ||= dropped;
  chain.value.closed ||= chain.after === 'literal' && kind === ')';
  const continues = chain.after === 'literal' && (kind === '.' || kind === '+');
  state.chain = continues ? { ...chain, after: kind } : undefined;
}

function quote(state: ValueState, index: number): void {
  const literal = state.byStart.get(index);
  if (literal === undefined) {
    return;
  }
  state.skipUntil = literal.end;
  const top = topOf(state);
  if (state.chain?.after === '+' && !literal.template) {
    state.chain.value.parts.push(literal);
    state.chain.after = 'literal';
  } else if (!literal.template && opensValue(state)) {
    const value = {
      parts: [literal],
      needsClose: top.lastArgument && state.prev === ',',
      dropped: false,
      closed: false,
    };
    state.found.push(value);
    state.chain = { value, after: 'literal' };
  }
  state.prev = 'literal';
}

function parenFrame(state: ValueState, top: Frame, bracket: string): Frame {
  if (bracket === '[') {
    return { kind: 'index', valued: false, branches: false, lastArgument: false };
  }
  if (KEYWORDS.has(state.prev) && state.prev !== 'else') {
    return {
      kind: 'head',
      head: state.prev,
      valued: false,
      branches: false,
      lastArgument: false,
    };
  }
  if (state.prev === 'name') {
    const { name } = state;
    const lastArgument = top.valued && LAST_ARGUMENT_CALLS.has(name ?? '');
    return {
      kind: 'call',
      name,
      valued: top.valued && ONLY_ARGUMENT_CALLS.has(name ?? ''),
      branches: false,
      lastArgument,
    };
  }
  return {
    kind: 'group',
    valued: top.valued && VALUE_STARTS.has(state.prev),
    branches: false,
    lastArgument: false,
  };
}

function blockFrame(state: ValueState, top: Frame): Frame {
  const { closed, prev } = state;
  if (prev === 'when' || (prev === ')' && closed?.head === 'when')) {
    return { kind: 'when', branches: top.valued, valued: false, lastArgument: false };
  }
  const lambda =
    (prev === 'name' && LAMBDA_CALLS.has(state.name ?? '')) ||
    (prev === ')' && closed?.kind === 'call' && LAMBDA_CALLS.has(closed.name ?? ''));
  const branch = followsIf(state) || prev === 'else';
  const arrow = prev === '->' && (top.kind === 'when' ? top.branches : top.valued);
  return {
    kind: 'block',
    valued: arrow || ((lambda || branch) && top.valued),
    branches: false,
    lastArgument: false,
  };
}

function open(state: ValueState, bracket: string): void {
  const top = topOf(state);
  state.frames.push(bracket === '{' ? blockFrame(state, top) : parenFrame(state, top, bracket));
  state.prev = bracket;
}

function close(state: ValueState): void {
  if (state.frames.length === 1) {
    state.done = true;
    return;
  }
  state.closed = state.frames.pop();
  state.prev = ')';
}

function separate(state: ValueState, mark: string, index: number): void {
  const atRoot = state.frames.length === 1;
  if (mark !== '\n') {
    state.done = atRoot;
    state.prev = mark;
    return;
  }
  CONTINUED_LINE.lastIndex = index + 1;
  const continued = OPEN_ENDED.has(state.prev) || CONTINUED_LINE.test(state.code);
  state.done = atRoot && !continued;
}

function step(state: ValueState, { index, 0: text }: RegExpExecArray): void {
  const kind = kindOf(text);
  settleChain(state, kind, text);
  if (kind === 'quote') {
    quote(state, index);
  } else if (kind === '(' || kind === '[' || kind === '{') {
    open(state, kind);
  } else if (CLOSERS.has(kind)) {
    close(state);
  } else if (kind === ',' || kind === ';' || kind === '\n') {
    separate(state, kind, index);
  } else {
    state.name = text;
    state.prev = kind;
  }
}

function textOf(literal: Literal): string {
  const text = literal.text.replaceAll('\\$', '$');
  return literal.raw ? text.trim() : text;
}

export function valueLiterals(
  scanned: IndexedScan,
  from: number,
): { start: number; text: string }[] {
  const state: ValueState = {
    code: scanned.code,
    byStart: scanned.index.byStart,
    frames: [ROOT_FRAME],
    prev: 'start',
    found: [],
    skipUntil: 0,
    done: false,
  };
  const tokens = new RegExp(TOKEN.source, 'g');
  tokens.lastIndex = from;
  for (const match of scanned.code.matchAll(tokens)) {
    if (match.index >= state.skipUntil) {
      step(state, match);
    }
    if (state.done) {
      break;
    }
  }
  return state.found
    .filter((value) => !value.dropped && (!value.needsClose || value.closed))
    .flatMap(({ parts }) =>
      parts[0] === undefined ? [] : [{ start: parts[0].start, text: parts.map(textOf).join('') }],
    );
}
