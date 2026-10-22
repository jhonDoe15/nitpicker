import { enclosingHosts, isSparedByBoundary, nearestRunner, schedulerOf } from './scope-hosts.mjs';

export const REAL_DELAY_MESSAGE =
  'delay on a real dispatcher waits for real, so the test is slow and flaky: withContext(Dispatchers.IO), withContext(Dispatchers.Default), a thread-pool dispatcher or Dispatchers.Main without a test dispatcher leaves the test scheduler even inside runTest, and a Kotest test body outside runTest is not in virtual time either. Give the code the test dispatcher (StandardTestDispatcher(testScheduler), or the one runTest provides) so delay runs in virtual time and advanceTimeBy or advanceUntilIdle moves it, or wait on the condition in a loop against a deadline. A delay in a launch, async or flow body, a mock answer or a test fake that implements or extends a main class is allowed.';

const DELAY = /(?<![\w.`])delay\s*\(/gu;
const VIRTUAL_RUNNERS = new Set(['runTest', 'runBlockingTest']);

export function realDelays(context) {
  const { code, node, declarations, project } = context;
  if (project.functionNames.has('delay')) {
    return [];
  }
  const kotest = node.framework === 'kotest';
  const initial = kotest && !project.coroutineTestScope ? 'real' : 'unknown';
  return [...code.slice(node.body.start, node.body.end).matchAll(DELAY)].flatMap((match) => {
    const offset = node.body.start + match.index;
    const hosts = enclosingHosts(code, node.body.start, offset);
    const runner = nearestRunner(hosts);
    const real = schedulerOf(hosts, initial, { declarations, project }) === 'real';
    const owned = VIRTUAL_RUNNERS.has(runner) || (kotest && runner === undefined);
    return real && owned && !isSparedByBoundary(code, hosts) ? [{ offset }] : [];
  });
}
