import { escapeRegExp } from '../../../../../../../../shared/paths/glob.mjs';
import { testBodies } from '../../discovery/test-units.mjs';
import { functionsOf } from '../../discovery/functions.mjs';
import {
  closeOf,
  matchingOpen,
  repeatUntil,
  skipSpace,
  wordBefore,
} from '../../discovery/text-scan.mjs';

export const DROPPED_RULE = 'DroppedCallbackInTest';
export const DROPPED_MESSAGE =
  'The callback this call returns never runs. Pass it on or call it: ctx.run(assertMax(123)) or assertMax(123)(ctx), not a bare assertMax(123) statement or a lambda that only builds it. An exception fits only a function that returns a callback on purpose.';

const CALLBACK_TYPES = [
  'Runnable Callable Supplier Consumer BiConsumer Function BiFunction Predicate BiPredicate',
  'UnaryOperator BinaryOperator Executable ThrowingSupplier ThrowingConsumer ContextConsumer',
]
  .join(' ')
  .split(' ');
const FUNCTION_TYPE = /^(?:suspend\s+)?\(.*\)\s*->/u;
const FUN_INTERFACE = /\bfun\s+interface\s+(\w+)/gu;
const CONTINUATION = /^(?:\.|\?[.:]|&&|\|\||\()/u;
const BLOCK_HEADS = new Set(['if', 'for', 'while', 'when', 'catch', 'switch']);
const BLOCK_WORDS = /(?:\belse|\btry|\bfinally|\bdo)$/u;
const RUN_LIKE = new Set([
  ...['run', 'forEach', 'forEachIndexed', 'onEach', 'ifPresent', 'execute', 'repeat'],
  ...['assertAll', 'assertThrows', 'assertFailsWith'],
]);
const SIGNATURE_WINDOW = 200;
const BLOCK_WORD_WINDOW = 40;
const MAX_CHAIN = 20;
const VALUE_HEADS = new Set(['if', 'when', 'run']);
const PREVIOUS_ENDS = /[\w)\]"'}]/u;

function callbackNames(scanned) {
  const own = [...scanned.code.matchAll(FUN_INTERFACE)].map((match) => match[1]);
  const alternation = [...CALLBACK_TYPES, ...own].map(escapeRegExp).join('|');
  const named = new RegExp(String.raw`^(?:[\w.]*(?:${alternation}))\b`, 'u');
  return new Set(
    functionsOf(scanned)
      .filter(({ body }) => FUNCTION_TYPE.test(body.returns) || named.test(body.returns))
      .map(({ name }) => name),
  );
}

function enclosingBrace(scanned, from, floor) {
  const { code } = scanned;
  const state = { index: from - 1 };
  repeatUntil(from - floor + 1, () => {
    const done = state.index < floor || code[state.index] === '{';
    const skipped = code[state.index] === '}' ? matchingOpen(scanned, state.index) : state.index;
    state.index = done ? state.index : skipped - 1;
    return done;
  });
  return state.index >= floor ? state.index : -1;
}

function lastSignificant(code, from, floor) {
  const trimmed = code.slice(floor, from).trimEnd();
  return floor + trimmed.length - 1;
}

function headOf(scanned, brace) {
  const { code } = scanned;
  const last = lastSignificant(code, brace, Math.max(0, brace - SIGNATURE_WINDOW));
  return code[last] === ')'
    ? wordBefore(scanned, matchingOpen(scanned, last))
    : wordBefore(scanned, last + 1);
}

function chainStart(scanned, index) {
  const { code } = scanned;
  const state = { start: index };
  repeatUntil(MAX_CHAIN, () => {
    const floor = Math.max(0, state.start - SIGNATURE_WINDOW);
    const dot = lastSignificant(code, state.start, floor);
    if (code[dot] !== '.') {
      return true;
    }
    const before = lastSignificant(code, code[dot - 1] === '?' ? dot - 1 : dot, floor);
    const receiver = code[before] === ')' ? matchingOpen(scanned, before) : before + 1;
    state.start = wordBefore(scanned, receiver).start;
    return false;
  });
  return state.start;
}

function opensStatements(scanned, brace, body) {
  const { code } = scanned;
  if (brace === body.start - 1) {
    return { result: true };
  }
  if (BLOCK_WORDS.test(code.slice(Math.max(0, brace - BLOCK_WORD_WINDOW), brace).trimEnd())) {
    return { result: true };
  }
  const head = headOf(scanned, brace);
  if (!(BLOCK_HEADS.has(head.word) || RUN_LIKE.has(head.word))) {
    return { result: false };
  }
  return VALUE_HEADS.has(head.word) ? { start: chainStart(scanned, head.start) } : { result: true };
}

function statementStep(scanned, start, body) {
  const { code } = scanned;
  const before = lastSignificant(code, start, body.start);
  const mark = code[before];
  if (before < body.start || mark === ';' || mark === '}') {
    return { result: true };
  }
  if (mark === '{') {
    return opensStatements(scanned, before, body);
  }
  if (mark === '>' && code[before - 1] === '-') {
    const brace = enclosingBrace(scanned, before, body.start - 1);
    return brace >= 0 ? opensStatements(scanned, brace, body) : { result: false };
  }
  return { result: PREVIOUS_ENDS.test(mark) && code.slice(before, start).includes('\n') };
}

function startsStatement(scanned, start, body) {
  const state = { start, result: false };
  repeatUntil(body.end - body.start + 1, () => {
    const step = statementStep(scanned, state.start, body);
    state.start = step.start ?? state.start;
    state.result = step.result ?? false;
    return step.result !== undefined;
  });
  return state.result;
}

function isDropped(scanned, call, body) {
  const after = skipSpace(scanned.code, call.end);
  const rest = scanned.code.slice(after, after + 2);
  return !CONTINUATION.test(rest) && startsStatement(scanned, call.start, body);
}

function callsOf(scanned, names, body) {
  if (names.size === 0) {
    return [];
  }
  const alternation = [...names].map(escapeRegExp).join('|');
  const pattern = new RegExp(String.raw`(?<![\w.\u0060])((?:this\.)?(${alternation}))\s*\(`, 'gu');
  const text = scanned.code.slice(body.start, body.end);
  return [...text.matchAll(pattern)].map((match) => {
    const start = body.start + match.index;
    const open = start + match[0].length - 1;
    return { name: match[2], start, end: closeOf(scanned, open) + 1 };
  });
}

export function droppedCallbacks(scanned, suites) {
  const names = callbackNames(scanned);
  return testBodies(scanned, suites).flatMap((test) =>
    callsOf(scanned, names, test.body)
      .filter((call) => isDropped(scanned, call, test.body))
      .map((call) => ({
        offset: call.start,
        symbol: test.symbol,
        key: `${test.symbol}:${call.name}`,
      })),
  );
}
