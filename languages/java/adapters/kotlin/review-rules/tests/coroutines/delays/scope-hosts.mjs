import { enclosingHosts } from '../../discovery/hosts.mjs';
import {
  closeOf,
  execAt,
  matchingOpen,
  trimmedEnd,
  wordBefore,
} from '../../discovery/text-scan.mjs';
import { isInlineHost, isSparedHost } from '../../test-waits.mjs';
import { statementEnd } from '../../honesty/flow/flow-bodies.mjs';
import { classifyContext } from './dispatchers.mjs';

const CLOCK = new RegExp(
  [
    String.raw`nanoTime|currentTimeMillis|Instant\.now|markNow|elapsedNow|TimeSource`,
    String.raw`Clock\b|measureTime|withTimeout|deadline`,
  ].join('|'),
  'u',
);
const CONSTANT_CONDITION = /^!*(?:true|false|\d+(?:\.\d+)?(?:[<>]=?|[!=]=)\d+(?:\.\d+)?)?$/u;
const SPACES = /\s+/gu;
const CONDITIONAL_EXIT = new RegExp(
  [
    String.raw`\b(?:if|when)\b[^\n]*\b(?:break|return)\b`,
    String.raw`\bif\s*\([^\n]*\)\s*\{[^}]*\b(?:break|return)\b`,
    String.raw`\?:\s*(?:break|return)\b`,
  ].join('|'),
  'u',
);
const DO_CONDITION = /\s*while\s*(?=\()/u;
const TRANSPARENT = new Set(['', 'if', 'else', 'when', 'try', 'catch', 'finally']);
const LOOPS = new Set(['for', 'while', 'do']);
const DECLARING = new Set(['fun', 'class', 'object']);
const RUNNERS = new Set(['runTest', 'runBlockingTest', 'runBlocking']);
const CONTEXT_BUILDERS = new Set(['withContext', 'launch', 'async']);
const NAMED_ARGUMENT = /^\s*\w+\s*=(?!=)/u;

function firstArgument(args) {
  const first = args.split(',')[0] ?? '';
  return NAMED_ARGUMENT.test(first) ? '' : first;
}

function loopCondition(text, host) {
  const { code } = text;
  if (host.name !== 'do') {
    return host.name === 'while' ? host.args : '';
  }
  const tail = execAt(code, DO_CONDITION, host.body.end + 1);
  const open = tail === null ? -1 : host.body.end + 1 + tail[0].length;
  return open < 0 ? 'true' : code.slice(open + 1, closeOf(text, open));
}

function isPolling(text, host) {
  const body = text.code.slice(host.body.start, host.body.end);
  const condition = loopCondition(text, host);
  const constant = CONSTANT_CONDITION.test(condition.replaceAll(SPACES, ''));
  const realCondition = host.name !== 'for' && !constant;
  return realCondition || CLOCK.test(body) || CLOCK.test(condition) || CONDITIONAL_EXIT.test(body);
}

function boundaryKind(text, host) {
  const { name } = host;
  if (TRANSPARENT.has(name) || isInlineHost(name)) {
    return 'transparent';
  }
  if (LOOPS.has(name)) {
    return isPolling(text, host) ? 'spared' : 'transparent';
  }
  return isSparedHost(name) || DECLARING.has(name) ? 'spared' : 'plain';
}

function unbracedLoop(text, offset) {
  const { code } = text;
  const before = trimmedEnd(text, offset);
  const open = code[before - 1] === ')' ? matchingOpen(text, before - 1) : -1;
  const name = open < 0 ? '' : wordBefore(text, open).word;
  if (name !== 'while' && name !== 'for') {
    return [];
  }
  const args = code.slice(open + 1, before - 1);
  return [
    {
      open: offset,
      name,
      args,
      receiver: '',
      body: { start: offset, end: statementEnd(code, offset) },
    },
  ];
}

export function hostsAt(text, from, offset) {
  const braced = enclosingHosts(text, from, offset).map((host) => ({
    ...host,
    body: { start: host.open, end: closeOf(text, host.open) },
  }));
  return [...braced, ...unbracedLoop(text, offset)];
}

export function innermostBoundary(text, hosts) {
  return hosts.toReversed().find((host) => boundaryKind(text, host) !== 'transparent');
}

export function isSparedByBoundary(text, hosts) {
  const boundary = innermostBoundary(text, hosts);
  return boundary !== undefined && boundaryKind(text, boundary) === 'spared';
}

function hostState(host, state, context) {
  const { name, args } = host;
  const { declarations, project } = context;
  if (name === 'runTest' || name === 'runBlockingTest') {
    const real = classifyContext(firstArgument(args), declarations, project) === 'real';
    return real ? 'real' : 'virtual';
  }
  if (name === 'runBlocking') {
    return 'blocking';
  }
  const text = name === 'withContext' ? args : firstArgument(args);
  const kind =
    CONTEXT_BUILDERS.has(name) && text.trim() !== ''
      ? classifyContext(text, declarations, project)
      : 'inherit';
  return kind === 'inherit' ? state : kind;
}

export function schedulerOf(hosts, initial, context) {
  return hosts.reduce((state, host) => hostState(host, state, context), initial);
}

export function nearestRunner(hosts) {
  return hosts.toReversed().find(({ name }) => RUNNERS.has(name))?.name;
}

export function builderContext(host, context) {
  const text = firstArgument(host.args);
  return text.trim() === ''
    ? 'inherit'
    : classifyContext(text, context.declarations, context.project);
}
