import { closeOf, escaped } from '../../discovery/text-scan.mjs';
import { assignedNamesAt, isJoined, joinedRightAfter } from '../join-evidence.mjs';
import {
  builderContext,
  hostsAt,
  innermostBoundary,
  isSparedByBoundary,
  nearestRunner,
  schedulerOf,
} from './scope-hosts.mjs';

export const REAL_DELAY_MESSAGE =
  'delay on a real dispatcher waits for real, so the test is slow and flaky: withContext(Dispatchers.IO), withContext(Dispatchers.Default), launch or async on such a dispatcher that the test then joins or awaits, a thread-pool dispatcher, runTest(Dispatchers.IO) or Dispatchers.Main without a test dispatcher leaves the test scheduler even inside runTest, and a Kotest test body outside runTest is not in virtual time either; the same holds in a test helper, and for a delay repeated in a loop that does not wait for a condition. Give the code the test dispatcher (StandardTestDispatcher(testScheduler), or the one runTest provides) so delay runs in virtual time and advanceTimeBy or advanceUntilIdle moves it, or wait on the condition in a loop against a deadline. A delay in background work the test does not wait for, a mock answer or a test fake that implements or extends a main class is allowed.';

const VIRTUAL_RUNNERS = new Set(['runTest', 'runBlockingTest']);
const WAITED_BUILDERS = new Set(['launch', 'async']);
const TEST_SCOPE_CONFIG = /\b(?:coroutineTestScope|testCoroutineDispatcher)\s*=\s*true\b/u;
const QUALIFIED_DELAY = String.raw`\bkotlinx\s*\.\s*coroutines\s*\.\s*delay\s*\(`;

export function delayPattern(names) {
  const bare = [...names].map(escaped);
  const parts = [
    ...(bare.length === 0 ? [] : [String.raw`(?<![\w.\x60])(?:${bare.join('|')})\s*\(`]),
    QUALIFIED_DELAY,
  ];
  return new RegExp(parts.join('|'), 'gu');
}

function isWaitedRealBuilder(context, hosts) {
  const { code } = context;
  const boundary = innermostBoundary(context, hosts);
  if (boundary === undefined || !WAITED_BUILDERS.has(boundary.name)) {
    return false;
  }
  if (builderContext(boundary, context) !== 'real') {
    return false;
  }
  const after = closeOf(context, boundary.open) + 1;
  const bodyText = code.slice(context.unit.body.start, context.unit.body.end);
  return (
    joinedRightAfter(code, after) ||
    assignedNamesAt(code, boundary.open).some((name) => isJoined(bodyText, name))
  );
}

function initialState(unit, project) {
  const virtual =
    project.coroutineTestScope ||
    (unit.configs ?? []).some((config) => TEST_SCOPE_CONFIG.test(config));
  return unit.framework === 'kotest' && !virtual ? 'real' : 'unknown';
}

function isOwned(unit, runner) {
  return VIRTUAL_RUNNERS.has(runner) || (runner === undefined && unit.framework !== 'junit');
}

export function realDelays(context) {
  const { code, unit, project, pattern } = context;
  const initial = initialState(unit, project);
  return [...code.slice(unit.body.start, unit.body.end).matchAll(pattern)].flatMap((match) => {
    const offset = unit.body.start + match.index;
    const hosts = hostsAt(context, unit.body.start, offset);
    const runner = nearestRunner(hosts);
    if (runner === 'runBlocking' || !isOwned(unit, runner)) {
      return [];
    }
    const real = schedulerOf(hosts, initial, context) === 'real';
    const spared = isSparedByBoundary(context, hosts) && !isWaitedRealBuilder(context, hosts);
    return real && !spared ? [{ offset }] : [];
  });
}
