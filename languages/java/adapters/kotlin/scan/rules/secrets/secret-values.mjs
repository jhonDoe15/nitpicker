import { literalIndex } from './literal-index.mjs';

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

function kindOf(text) {
  if (COMPARISONS.has(text)) {
    return 'compare';
  }
  if (/^[A-Za-z_]/.test(text)) {
    return KEYWORDS.has(text) ? text : 'name';
  }
  return text === '"' ? 'quote' : text;
}

function followsIf(state) {
  return state.prev === ')' && state.closed?.head === 'if';
}

function opensValue(state) {
  const top = state.frames.at(-1);
  if (top.kind === 'when') {
    return top.branches && state.prev === '->';
  }
  if (top.lastArgument && state.prev === ',') {
    return true;
  }
  return top.valued && (VALUE_STARTS.has(state.prev) || followsIf(state));
}

function settleChain(state, kind, text) {
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

function quote(state, index) {
  const literal = state.byStart.get(index);
  if (literal === undefined) {
    return;
  }
  state.skipUntil = literal.end;
  const top = state.frames.at(-1);
  if (state.chain?.after === '+' && !literal.template) {
    state.chain.value.parts.push(literal);
    state.chain.after = 'literal';
  } else if (!literal.template && opensValue(state)) {
    const value = { parts: [literal], needsClose: top.lastArgument === true && state.prev === ',' };
    state.found.push(value);
    state.chain = { value, after: 'literal' };
  }
  state.prev = 'literal';
}

function parenFrame(state, top, bracket) {
  if (bracket === '[') {
    return { kind: 'index', valued: false };
  }
  if (KEYWORDS.has(state.prev) && state.prev !== 'else') {
    return { kind: 'head', head: state.prev, valued: false };
  }
  if (state.prev === 'name') {
    const { name } = state;
    const lastArgument = top.valued && LAST_ARGUMENT_CALLS.has(name);
    return {
      kind: 'call',
      name,
      valued: top.valued && ONLY_ARGUMENT_CALLS.has(name),
      lastArgument,
    };
  }
  return { kind: 'group', valued: top.valued && VALUE_STARTS.has(state.prev) };
}

function blockFrame(state, top) {
  const { closed, prev } = state;
  if (prev === 'when' || (prev === ')' && closed?.head === 'when')) {
    return { kind: 'when', branches: top.valued, valued: false };
  }
  const lambda =
    (prev === 'name' && LAMBDA_CALLS.has(state.name)) ||
    (prev === ')' && closed?.kind === 'call' && LAMBDA_CALLS.has(closed.name));
  const branch = followsIf(state) || prev === 'else';
  const arrow = prev === '->' && (top.kind === 'when' ? top.branches : top.valued);
  return { kind: 'block', valued: arrow || ((lambda || branch) && top.valued) };
}

function open(state, bracket) {
  const top = state.frames.at(-1);
  state.frames.push(bracket === '{' ? blockFrame(state, top) : parenFrame(state, top, bracket));
  state.prev = bracket;
}

function close(state) {
  if (state.frames.length === 1) {
    state.done = true;
    return;
  }
  state.closed = state.frames.pop();
  state.prev = ')';
}

function separate(state, mark, index) {
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

function step(state, { index, 0: text }) {
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

function textOf(literal) {
  const text = literal.text.replaceAll('\\$', '$');
  return literal.raw ? text.trim() : text;
}

export function valueLiterals(scanned, from) {
  const state = {
    code: scanned.code,
    byStart: literalIndex(scanned).byStart,
    frames: [{ kind: 'root', valued: true }],
    prev: 'start',
    found: [],
    skipUntil: 0,
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
    .map(({ parts }) => ({ start: parts[0].start, text: parts.map(textOf).join('') }));
}
