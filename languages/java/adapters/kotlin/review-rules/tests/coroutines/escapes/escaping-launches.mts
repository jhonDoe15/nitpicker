import type { Span, TextSource } from '../../typed/discovery-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import type {
  BodyContext,
  EscapeContext,
  Launch,
  ReceiverContext,
  ScopeReceiver,
} from '../../typed/rule-types.mts';
import { enclosingHosts } from '../../discovery/hosts.mts';
import { closeOf, skipSpace } from '../../discovery/text-scan.mts';
import { nearestRunner } from '../delays/scope-hosts.mts';
import {
  assignedNamesAt,
  isJoined,
  isOwnedByEnclosingCall,
  joinedRightAfter,
} from '../join-evidence.mts';
import { implicitReceiver, kindOfText, receiverOf } from './escape-scopes.mts';
import { isTornDown, waitsAfter } from './escape-waits.mts';

export const ESCAPING_RULE = 'CoroutineEscapesTest';
export const ESCAPING_MESSAGE =
  'This test starts a coroutine that the test does not wait for, so it can still be running, or fail, after the test has passed: a launch, async, launchIn, stateIn or shareIn on CoroutineScope(...), MainScope(), a scope kept in a field or a local, a scope a helper returns, lifecycleScope or viewModelScope without a test Main dispatcher, or a TestScope outside runTest is not a child of the test, and with, run, apply or also on such a scope does not change that. Run the body in runTest (or runBlocking, coroutineScope, supervisorScope) and launch from there, keep the Job or Deferred and join or await it (`val job = scope.launch { ... }; job.join()`), or build the scope on the test dispatcher and drive it with advanceUntilIdle; `backgroundScope.launch` inside runTest is for work that should end with the test. An exception fits only when the test waits through a harness this rule cannot see.';

const MEMBER_BUILDER = /(?:\?\.|\.)\s*(launch|async|future)\s*(?=[({<])/gu;
const BARE_BUILDER = /(?<![\w.`])(launch|async)\s*(?=[({<])/gu;
const SCOPE_ARGUMENT = /(?:\?\.|\.)\s*(launchIn|produceIn|stateIn|shareIn)\s*\(/gu;
const TEST_CLOCK = /\b(?:advanceUntilIdle|runCurrent|advanceTimeBy|testScheduler|runTest)\b/u;

type ReceiverFinder = (context: ReceiverContext, offset: number) => ScopeReceiver | undefined;

function builderLaunches(
  context: BodyContext,
  { range, pattern, receiverAt }: { range: Span; pattern: RegExp; receiverAt: ReceiverFinder },
): Launch[] {
  const { code } = context;
  return [...code.slice(range.start, range.end).matchAll(pattern)].flatMap((match) => {
    const offset = range.start + match.index;
    const hosts = enclosingHosts(context, range.start, offset);
    const receiver = receiverAt({ ...context, hosts }, offset);
    const after = offset + match[0].length;
    return receiver === undefined
      ? []
      : [{ ...receiver, offset, after, builder: groupOf(match, 1), hosts }];
  });
}

function memberLaunches(context: BodyContext, range: Span): Launch[] {
  return builderLaunches(context, { range, pattern: MEMBER_BUILDER, receiverAt: receiverOf });
}

function bareLaunches(context: BodyContext, range: Span): Launch[] {
  return builderLaunches(context, {
    range,
    pattern: BARE_BUILDER,
    receiverAt: (receiving) => implicitReceiver(receiving),
  });
}

function argumentLaunches(context: BodyContext, range: Span): Launch[] {
  const { code } = context;
  return [...code.slice(range.start, range.end).matchAll(SCOPE_ARGUMENT)].flatMap((match) => {
    const offset = range.start + match.index;
    const open = offset + match[0].length - 1;
    const close = closeOf(context, open);
    const kind = kindOfText(code.slice(open + 1, close).split(',')[0] ?? '', context);
    const hosts = enclosingHosts(context, range.start, offset);
    return kind === undefined
      ? []
      : [{ kind, offset, after: close + 1, builder: groupOf(match, 1), hosts }];
  });
}

function callEnd(text: TextSource, from: number): number {
  const { code } = text;
  const at = skipSpace(code, from);
  const afterArgs = code[at] === '(' ? closeOf(text, at) + 1 : at;
  const lambda = skipSpace(code, afterArgs);
  return code[lambda] === '{' ? closeOf(text, lambda) + 1 : afterArgs;
}

function isTestDriven(context: BodyContext, found: Launch): boolean {
  const testKind = found.kind === 'test';
  return (
    testKind && (nearestRunner(found.hosts) !== undefined || TEST_CLOCK.test(context.bodyText))
  );
}

function isAwaited(context: BodyContext, found: Launch): boolean {
  const { code, bodyText, teardown, unit, syncs } = context;
  if (isTestDriven(context, found)) {
    return true;
  }
  const end = callEnd(context, found.after);
  const assigned = [found.offset, ...found.hosts.map(({ open }) => open)].flatMap((index) =>
    assignedNamesAt(code, index),
  );
  const names = found.name === undefined ? assigned : [...assigned, found.name];
  return (
    joinedRightAfter(code, end) ||
    isOwnedByEnclosingCall(context, found) ||
    assigned.some((name) => isJoined(bodyText, name, 'named')) ||
    (found.name !== undefined && isJoined(bodyText, found.name, 'receiver')) ||
    names.some((name) => isTornDown(teardown, name)) ||
    waitsAfter(code.slice(end, unit.body.end), syncs)
  );
}

export function escapingLaunches(context: EscapeContext): { offset: number; builder: string }[] {
  const { code, unit } = context;
  const bodyText = code.slice(unit.body.start, unit.body.end);
  const full = { ...context, bodyText };
  return [
    ...memberLaunches(full, unit.body),
    ...bareLaunches(full, unit.body),
    ...argumentLaunches(full, unit.body),
  ]
    .filter((found) => !isAwaited(full, found))
    .toSorted((left, right) => left.offset - right.offset)
    .map(({ offset, builder }) => ({ offset, builder }));
}
