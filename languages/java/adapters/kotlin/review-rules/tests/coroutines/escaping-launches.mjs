import { closingIndex } from '../../../scan/kotlin-source.mjs';
import { functionsOf, matchingOpen } from '../discovery/declarations.mjs';
import { repeatUntil } from '../discovery/repeat.mjs';
import { enclosingHosts, nearestRunner } from './scope-hosts.mjs';

export const ESCAPING_RULE = 'CoroutineEscapesTest';
export const ESCAPING_MESSAGE =
  'This test starts a coroutine that the test does not wait for, so it can still be running, or fail, after the test has passed: a launch or async on CoroutineScope(...), on a scope kept in a field or a local, or on a TestScope outside runTest is not a child of the test. Run the body in runTest (or runBlocking, coroutineScope, supervisorScope) and launch from there, or keep the Job or Deferred and join or await it (`val job = scope.launch { ... }; job.join()`); `backgroundScope.launch` inside runTest is for work that should end with the test. An exception fits only when the test waits through a harness this rule cannot see, such as a latch of its own.';

const BUILDER = /\.\s*(launch|async|future)\s*(?=[({<])/gu;
const JOINED_AFTER =
  /^\s*\??\.\s*(?:join|await|get|getCompleted|cancelAndJoin|awaitAll|joinAll|asCompletableFuture)\b/u;
const SCOPE_CALLS = new Set(['CoroutineScope', 'MainScope', 'CloseableCoroutineScope']);
const TEST_SCOPE = /\bTest(?:Coroutine)?Scope\b/u;
const REAL_SCOPE = /\b(?:CoroutineScope|MainScope|CloseableCoroutineScope)\b/u;
const DECLARATION = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w.]+))?\s*(?:=\s*([^\n]*))?/gu;
const ASSIGNED = /^\s*(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*(?::[^=]+)?\+?=(?!=)/u;
const ADDED = /^\s*([A-Za-z_]\w*)\s*\.\s*(?:add|put|plusAssign)\s*\(/u;
const JOIN_CALL = /\b(?:joinAll|awaitAll)\s*\(/gu;
const CHAIN_START = /^\s*(?:\.|\?\.)/u;
const WORD_BEFORE = /([A-Za-z_]\w*)\s*$/u;
const ALIAS_IMPORT = /import\s+kotlinx\.coroutines\.GlobalScope\s+as\s+(\w+)/u;
const EXTERNAL_SYNC = new RegExp(
  [
    String.raw`\b(?:CountDownLatch|CompletableFuture|CompletableDeferred|Phaser|CyclicBarrier)\b`,
    String.raw`\b(?:Semaphore|Awaitility|awaitility|eventually|untilAsserted)\b`,
    String.raw`\.\s*await\s*\([^)]`,
    String.raw`\bawait\s*\(\s*\)\s*\.`,
  ].join('|'),
  'u',
);
const AMBIGUOUS = 'ambiguous';
const MAX_CHAIN_LINES = 20;
const TEST_CLOCK = /\b(?:advanceUntilIdle|runCurrent|advanceTimeBy|testScheduler)\b/u;
const TEARDOWN_ANNOTATIONS = new Set(['After', 'AfterEach', 'AfterTest', 'AfterAll', 'AfterClass']);
const TEARDOWN_CALL =
  /(?<![\w.`])(?:afterTest|afterEach|afterSpec|afterContainer|afterAny|finalizeSpec)\s*(?=\{)/gu;

function kindOf(text) {
  if (TEST_SCOPE.test(text)) {
    return 'test';
  }
  return REAL_SCOPE.test(text) ? 'real' : undefined;
}

export function declaredScopes(code) {
  const kinds = new Map();
  for (const match of code.matchAll(DECLARATION)) {
    const kind = kindOf(`${match[2] ?? ''} ${match[3] ?? ''}`) ?? AMBIGUOUS;
    const known = kinds.get(match[1]);
    kinds.set(match[1], known === undefined || known === kind ? kind : AMBIGUOUS);
  }
  return new Map([...kinds].filter(([, kind]) => kind !== AMBIGUOUS));
}

export function teardownText(scanned) {
  const { code } = scanned;
  const annotated = functionsOf(scanned)
    .filter((fn) => fn.annotations.some(({ name }) => TEARDOWN_ANNOTATIONS.has(name)))
    .map((fn) => code.slice(fn.body.start, fn.body.end));
  const lambdas = [...code.matchAll(TEARDOWN_CALL)].map((match) => {
    const open = match.index + match[0].length;
    return code.slice(open, closingIndex(code, open));
  });
  return [...annotated, ...lambdas].join('\n');
}

export function globalScopeAliases(code, source) {
  const alias = ALIAS_IMPORT.exec(source)?.[1];
  return alias === undefined || !code.includes(alias) ? new Set() : new Set([alias]);
}

function receiverOf(code, dotIndex, { scopes, aliases }) {
  const end = code.slice(0, dotIndex).trimEnd().length;
  if (code[end - 1] === ')') {
    const name = WORD_BEFORE.exec(code.slice(0, matchingOpen(code, end - 1)).trimEnd())?.[1];
    if (SCOPE_CALLS.has(name)) {
      return { kind: 'real' };
    }
    return name === 'TestScope' ? { kind: 'test' } : undefined;
  }
  const name = WORD_BEFORE.exec(code.slice(0, end))?.[1];
  const before = code.slice(0, end - (name?.length ?? 0)).trimEnd();
  if (name === undefined || (before.endsWith('.') && !before.endsWith('this.'))) {
    return undefined;
  }
  if (aliases.has(name)) {
    return { kind: 'real' };
  }
  return scopes.has(name) ? { kind: scopes.get(name), name } : undefined;
}

function callEnd(code, from) {
  let at = from + code.slice(from).search(/\S|$/u);
  if (code[at] === '<') {
    at = code.indexOf('>', at) + 1;
  }
  if (code[at] === '(') {
    at = closingIndex(code, at) + 1;
  }
  const lambda = at + code.slice(at).search(/\S|$/u);
  return code[lambda] === '{' ? closingIndex(code, lambda) + 1 : at;
}

function statementText(code, index) {
  const state = { start: code.lastIndexOf('\n', index) + 1 };
  state.text = code.slice(state.start, index);
  repeatUntil(MAX_CHAIN_LINES, () => {
    if (state.start === 0 || !CHAIN_START.test(state.text)) {
      return true;
    }
    state.start = code.lastIndexOf('\n', state.start - 2) + 1;
    state.text = code.slice(state.start, index);
    return false;
  });
  return state.text;
}

function assignedNames(code, offset, hosts) {
  return [offset, ...hosts.map(({ open }) => open)]
    .map((index) => statementText(code, index))
    .flatMap((text) => [ASSIGNED.exec(text)?.[1], ADDED.exec(text)?.[1]])
    .filter((name) => name !== undefined);
}

function escaped(name) {
  return name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

function isJoined(bodyText, name, { receiver = false } = {}) {
  const word = escaped(name);
  const members = receiver
    ? 'cancel|cancelChildren|coroutineContext'
    : 'join|await|awaitAll|joinAll|cancelAndJoin|getCompleted|get|cancelChildren|cancel|asCompletableFuture';
  const direct = String.raw`\b${word}\b\s*\??\.\s*(?:${members})\b`;
  const bulk = String.raw`\b(?:joinAll|awaitAll)\b[^\n]*\b${word}\b`;
  const each = String.raw`\b${word}\b[^\n]*\b(?:forEach|map|onEach)\s*\{[^}]*\b(?:join|await)\b`;
  return new RegExp(`${direct}|${bulk}|${each}`, 'u').test(bodyText);
}

function isTornDown(teardown, name) {
  const word = escaped(name);
  return new RegExp(
    String.raw`\b${word}\b[^\n]*\b(?:cancel|join|close)\w*|\b(?:cancel|close)\w*\s*\(\s*${word}\b`,
    'u',
  ).test(teardown);
}

function isOwnedByEnclosingCall(code, found, hosts) {
  const inLambda = hosts.some(({ open }) =>
    /^\s*\.\s*(?:joinAll|awaitAll)\b/u.test(code.slice(closingIndex(code, open) + 1)),
  );
  const inArguments = [...code.matchAll(JOIN_CALL)].some((match) => {
    const open = match.index + match[0].length - 1;
    return open < found.offset && found.offset < closingIndex(code, open);
  });
  return inLambda || inArguments;
}

function isAwaited(context, found) {
  const { code, bodyText, teardown, node } = context;
  const hosts = enclosingHosts(code, node.body.start, found.offset);
  if (found.kind === 'test' && (nearestRunner(hosts) !== undefined || TEST_CLOCK.test(bodyText))) {
    return true;
  }
  const assigned = assignedNames(code, found.offset, hosts);
  const names = found.name === undefined ? assigned : [...assigned, found.name];
  return (
    JOINED_AFTER.test(code.slice(callEnd(code, found.after))) ||
    isOwnedByEnclosingCall(code, found, hosts) ||
    assigned.some((name) => isJoined(bodyText, name)) ||
    (found.name !== undefined && isJoined(bodyText, found.name, { receiver: true })) ||
    names.some((name) => isTornDown(teardown, name))
  );
}

export function escapingLaunches(context) {
  const { code, node, scopes, aliases } = context;
  const bodyText = code.slice(node.body.start, node.body.end);
  if (EXTERNAL_SYNC.test(bodyText)) {
    return [];
  }
  return [...bodyText.matchAll(BUILDER)].flatMap((match) => {
    const offset = node.body.start + match.index;
    const receiver = receiverOf(code, offset, { scopes, aliases });
    const found = { ...receiver, offset, after: offset + match[0].length, builder: match[1] };
    return receiver === undefined || isAwaited({ ...context, bodyText }, found) ? [] : [found];
  });
}
