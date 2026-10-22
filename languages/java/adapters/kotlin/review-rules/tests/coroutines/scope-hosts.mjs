import { closingIndex } from '../../../scan/kotlin-source.mjs';
import { matchingOpen } from '../discovery/declarations.mjs';
import { isInlineHost, isSparedHost } from '../test-waits.mjs';

const REAL_DISPATCHER = new RegExp(
  [
    String.raw`\bDispatchers\s*\.\s*(?:Default|IO|Unconfined)\b`,
    String.raw`\b(?:newSingleThreadContext|newFixedThreadPoolContext)\s*\(`,
    String.raw`\.\s*asCoroutineDispatcher\s*\(`,
  ].join('|'),
  'u',
);
const MAIN_DISPATCHER = /\bDispatchers\s*\.\s*Main\b/u;
const TEST_DISPATCHER =
  /Test(?:Dispatcher|CoroutineScheduler|Scope)\b|\btestScheduler\b|\btestDispatcher\b/u;
const NEUTRAL_CONTEXT =
  /^\s*(?:(?:NonCancellable|EmptyCoroutineContext|CoroutineName\([^)]*\)|(?:Supervisor)?Job\(\))\s*(?:\+\s*)?)+$/u;
const DECLARATION = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w.]+))?\s*(?:=\s*([^\n]*))?/gu;
const IDENTIFIER_ONLY = /^\s*(?:this\.)?([A-Za-z_]\w*)\s*$/u;
const RANGE = /\.\.|\buntil\b|\bdownTo\b|\bstep\b|\.indices\b/u;
const CLOCK =
  /nanoTime|currentTimeMillis|Instant\.now|markNow|elapsedNow|TimeSource|Clock\b|measureTime/u;
const WORD_BEFORE = /([A-Za-z_]\w*)\s*$/u;
const TRANSPARENT = new Set(['', 'if', 'else', 'when', 'try', 'catch', 'finally']);
const DECLARING = new Set(['fun', 'class', 'object']);
const RUNNERS = new Set(['runTest', 'runBlockingTest', 'runBlocking']);
const STATE_HOSTS = { runTest: 'virtual', runBlockingTest: 'virtual', runBlocking: 'blocking' };
const NO_HOST_BEFORE = ['->', '=', '(', ','];

export function contextDeclarations(code) {
  const declared = new Map();
  const conflicting = new Set();
  for (const match of code.matchAll(DECLARATION)) {
    const text = `${match[2] ?? ''} ${match[3] ?? ''}`;
    if (declared.has(match[1]) && declared.get(match[1]) !== text) {
      conflicting.add(match[1]);
    }
    declared.set(match[1], text);
  }
  for (const name of conflicting) {
    declared.delete(name);
  }
  return declared;
}

function classifyText(text, project) {
  const main = MAIN_DISPATCHER.test(text);
  const real = REAL_DISPATCHER.test(text) || (main && !project.mainReplaced);
  const virtual = TEST_DISPATCHER.test(text) || (main && project.mainReplaced);
  if (real && virtual) {
    return 'unknown';
  }
  if (real || virtual) {
    return real ? 'real' : 'virtual';
  }
  return NEUTRAL_CONTEXT.test(text) ? 'inherit' : undefined;
}

function classifyContext(text, declarations, project) {
  const direct = classifyText(text, project);
  if (direct !== undefined) {
    return direct;
  }
  const identifier = IDENTIFIER_ONLY.exec(text)?.[1];
  const declared = identifier === undefined ? undefined : declarations.get(identifier);
  const resolved = declared === undefined ? undefined : classifyText(declared, project);
  return resolved === 'real' || resolved === 'virtual' ? resolved : 'unknown';
}

function hostAt(code, open) {
  const before = code.slice(0, open).trimEnd();
  if (NO_HOST_BEFORE.some((mark) => before.endsWith(mark))) {
    return { name: '', args: '' };
  }
  let end = before.length;
  let args = '';
  if (before.endsWith(')')) {
    const callOpen = matchingOpen(code, end - 1);
    args = code.slice(callOpen + 1, end - 1);
    end = code.slice(0, callOpen).trimEnd().length;
  }
  const name = WORD_BEFORE.exec(code.slice(0, end))?.[1] ?? '';
  const previous = WORD_BEFORE.exec(code.slice(0, end - name.length))?.[1];
  return { name: DECLARING.has(previous) ? previous : name, args };
}

export function enclosingHosts(code, from, offset) {
  const stack = [];
  for (const match of code.slice(from, offset).matchAll(/[{}]/gu)) {
    if (match[0] === '{') {
      stack.push(from + match.index);
    } else {
      stack.pop();
    }
  }
  return stack.map((open) => ({ open, ...hostAt(code, open) }));
}

function boundaryKind(code, host) {
  const { name, args, open } = host;
  if (TRANSPARENT.has(name) || isInlineHost(name)) {
    return 'transparent';
  }
  if (name === 'for') {
    return RANGE.test(args) ? 'spared' : 'transparent';
  }
  if (name === 'while') {
    const polling =
      args.trim() !== 'true' || CLOCK.test(code.slice(open, closingIndex(code, open)));
    return polling ? 'spared' : 'plain';
  }
  return name === 'do' || isSparedHost(name) || DECLARING.has(name) ? 'spared' : 'plain';
}

export function isSparedByBoundary(code, hosts) {
  const kinds = hosts.toReversed().map((host) => boundaryKind(code, host));
  return kinds.find((kind) => kind !== 'transparent') === 'spared';
}

export function schedulerOf(hosts, initial, { declarations, project }) {
  return hosts.reduce((state, { name, args }) => {
    if (STATE_HOSTS[name] !== undefined) {
      return STATE_HOSTS[name];
    }
    const context =
      name === 'withContext' ? classifyContext(args, declarations, project) : 'inherit';
    return context === 'inherit' ? state : context;
  }, initial);
}

export function nearestRunner(hosts) {
  return hosts.toReversed().find(({ name }) => RUNNERS.has(name))?.name;
}
