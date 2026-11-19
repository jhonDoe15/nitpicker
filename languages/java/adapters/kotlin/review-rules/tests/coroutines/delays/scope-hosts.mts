import type { TextSource } from '../../typed/discovery-types.mts';
import type {
  BodyHost,
  DelayProject,
  DispatchKind,
  Bindings,
  SchedulerState,
} from '../../typed/rule-types.mts';

type HostContext = { declarations: Bindings; project: DelayProject };
import { enclosingHosts } from '../../discovery/hosts.mts';
import {
  closeOf,
  execAt,
  matchingOpen,
  trimmedEnd,
  wordBefore,
} from '../../discovery/text-scan.mts';
import { isInlineHost, isSparedHost } from '../../test-waits.mts';
import { statementEnd } from '../../honesty/flow/flow-bodies.mts';
import { classifyContext } from './dispatchers.mts';

const INHERIT = 'inherit';
const WHILE = 'while';
const TRANSPARENT_KIND = 'transparent';
const SPARED_KIND = 'spared';
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
    String.raw`\b(?:if|when)\b[^\n]+\b(?:break|return)\b`,
    String.raw`\bif\s*\([^\n]*\)\s*\{[^}]*\b(?:break|return)\b`,
    String.raw`\?:\s*(?:break|return)\b`,
  ].join('|'),
  'u',
);
const DO_CONDITION = /\s*while\s*(?=\()/u;
const TRANSPARENT = new Set(['', 'if', 'else', 'when', 'try', 'catch', 'finally']);
const LOOPS = new Set(['for', WHILE, 'do']);
const DECLARING = new Set(['fun', 'class', 'object']);
const RUNNERS = new Set(['runTest', 'runBlockingTest', 'runBlocking']);
const CONTEXT_BUILDERS = new Set(['withContext', 'launch', 'async']);
const NAMED_ARGUMENT = /^\s*\w+\s*=(?!=)/u;

function firstArgument(args: string): string {
  const first = args.split(',')[0] ?? '';
  return NAMED_ARGUMENT.test(first) ? '' : first;
}

function loopCondition(text: TextSource, host: BodyHost): string {
  const { code } = text;
  if (host.name !== 'do') {
    return host.name === WHILE ? host.args : '';
  }
  const tail = execAt(code, DO_CONDITION, host.body.end + 1);
  const open = tail === undefined ? -1 : host.body.end + 1 + tail[0].length;
  return open < 0 ? 'true' : code.slice(open + 1, closeOf(text, open));
}

function isPolling(text: TextSource, host: BodyHost): boolean {
  const body = text.code.slice(host.body.start, host.body.end);
  const condition = loopCondition(text, host);
  const constant = CONSTANT_CONDITION.test(condition.replaceAll(SPACES, ''));
  const realCondition = host.name !== 'for' && !constant;
  return realCondition || CLOCK.test(body) || CLOCK.test(condition) || CONDITIONAL_EXIT.test(body);
}

function boundaryKind(
  text: TextSource,
  host: BodyHost,
): typeof TRANSPARENT_KIND | typeof SPARED_KIND | 'plain' {
  const { name } = host;
  if (TRANSPARENT.has(name) || isInlineHost(name)) {
    return TRANSPARENT_KIND;
  }
  if (LOOPS.has(name)) {
    return isPolling(text, host) ? SPARED_KIND : TRANSPARENT_KIND;
  }
  return isSparedHost(name) || DECLARING.has(name) ? SPARED_KIND : 'plain';
}

function unbracedLoop(text: TextSource, offset: number): BodyHost[] {
  const { code } = text;
  const before = trimmedEnd(text, offset);
  const open = code[before - 1] === ')' ? matchingOpen(text, before - 1) : -1;
  const name = open < 0 ? '' : wordBefore(text, open).word;
  if (name !== WHILE && name !== 'for') {
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

export function hostsAt(text: TextSource, from: number, offset: number): BodyHost[] {
  const braced = enclosingHosts(text, from, offset).map((host) => ({
    ...host,
    body: { start: host.open, end: closeOf(text, host.open) },
  }));
  return [...braced, ...unbracedLoop(text, offset)];
}

export function innermostBoundary(text: TextSource, hosts: BodyHost[]): BodyHost | undefined {
  return hosts.toReversed().find((host) => boundaryKind(text, host) !== TRANSPARENT_KIND);
}

export function isSparedByBoundary(text: TextSource, hosts: BodyHost[]): boolean {
  const boundary = innermostBoundary(text, hosts);
  return boundary !== undefined && boundaryKind(text, boundary) === SPARED_KIND;
}

function hostState(host: BodyHost, state: SchedulerState, context: HostContext): SchedulerState {
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
      : INHERIT;
  return kind === INHERIT ? state : kind;
}

export function schedulerOf(
  hosts: BodyHost[],
  initial: SchedulerState,
  context: HostContext,
): SchedulerState {
  return hosts.reduce<SchedulerState>((state, host) => hostState(host, state, context), initial);
}

export function nearestRunner(hosts: { name: string }[]): string | undefined {
  return hosts.toReversed().find(({ name }) => RUNNERS.has(name))?.name;
}

export function builderContext(host: BodyHost, context: HostContext): DispatchKind {
  const text = firstArgument(host.args);
  return text.trim() === ''
    ? INHERIT
    : classifyContext(text, context.declarations, context.project);
}
