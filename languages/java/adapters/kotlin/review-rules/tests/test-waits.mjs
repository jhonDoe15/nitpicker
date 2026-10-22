import {
  AWAITILITY_ADVICE,
  FIXED_SLEEP_RULE,
  timedWaitAdvice,
} from '../../../../messages/wait-advice.mjs';
import { importsFrom, insideClass } from '../kotlin-facts.mjs';
import { exceptionSentence } from '../review-finding.mjs';

export const NEGATIVE_WAIT_RULE = 'NegativeWaitInTest';

const SLEEP_MESSAGE =
  'A fixed wait makes the test slow and flaky: Thread.sleep, TimeUnit sleep or parkNanos outside a polling loop, after(ms) with a check that could pass sooner, or pollDelay(...).until { true }. Wait on the condition: a loop that checks it against a deadline (a sleep inside that loop is allowed), or verify(mock, timeout(1000)) for a mock. A sleep in a mock answer, a thread body or a test fake that implements or extends a main class is allowed. If a real wait is unavoidable, ';
const DELAY_MESSAGE =
  'delay inside runBlocking waits for real, so the test is slow and flaky. Use runTest, where delay runs in virtual time and advanceTimeBy or advanceUntilIdle moves it, or wait on the condition in a loop against a deadline. A delay in a launch, async or flow body, a mock answer or a test fake that implements or extends a main class is allowed. If a real wait is unavoidable, ';
const NEGATIVE_MESSAGE =
  'Do not prove that something does not happen by waiting out a delay: after(ms).never(), during(...) and kotest continually pass only after the full wait, so the test is slow and depends on the timing. Give the code a Clock or a scheduler the test controls, move it past the delay and assert at once. If a real wait is unavoidable, ';

const SPARED_HOSTS = new Set([
  'thread',
  'Thread',
  'launch',
  'async',
  'produce',
  'flow',
  'channelFlow',
  'callbackFlow',
  'execute',
  'submit',
  'schedule',
  'scheduleAtFixedRate',
  'runAsync',
  'supplyAsync',
  'startVirtualThread',
  'newThread',
  'thenAnswer',
  'doAnswer',
  'answers',
  'coAnswers',
  'timer',
  'fixedRateTimer',
  'Runnable',
  'Callable',
]);
const VIRTUAL_TIME_HOSTS = new Set(['runTest', 'runBlockingTest']);
const THREAD_TYPES = new Set(['Thread', 'Runnable']);
const NEGATIVE_FOLLOWERS = new Set(['never', 'atMost', 'atMostOnce']);
const IMPORTED_SLEEP = /^(?:java\.lang\.)?Thread\.sleep$/u;
const IMPORTED_PARK = /(?:^|\.)LockSupport\.parkNanos$/u;
const DURATION_ARGUMENT = /Duration|\.(?:nano|micro|milli)?seconds?\b|\.minutes?\b|\.hours?\b/u;
const DELAY_ARGUMENT =
  /^(?:\d[\d_]*L?|[A-Z][A-Z0-9_]*|\w*(?:ms|[Mm]illis|[Tt]imeout|[Dd]elay)\w*|.+\.toLong\(\))$/u;
const MOCKITO_QUALIFIER = /^(?:org\.mockito\.)?Mockito$/u;
const THREAD_QUALIFIER = /^(?:java\.lang\.)?Thread$/u;
const TIME_UNIT_QUALIFIER = /(?:^|\.)TimeUnit\.[A-Z]+$/u;
const LOCK_SUPPORT = /(?:^|\.)LockSupport$/u;
const BOUNDARIES = new Set(['loop', 'lambda', 'fun', 'init']);
const TYPE_FRAMES = new Set(['class', 'object']);
const TEST_ANNOTATIONS = new Set([
  'Test',
  'ParameterizedTest',
  'RepeatedTest',
  'TestFactory',
  'TestTemplate',
]);
const SLEEP_ARGUMENTS = 2;

function fixed(kind, exemptable = false) {
  return { rule: FIXED_SLEEP_RULE, kind, exemptable };
}
const negative = { rule: NEGATIVE_WAIT_RULE, kind: 'negative', exemptable: false };

function contextOf(file, wait, declared) {
  return {
    mockito: importsFrom(file, 'org.mockito'),
    awaitility: importsFrom(file, 'org.awaitility'),
    kotest: importsFrom(file, 'io.kotest'),
    playwright: importsFrom(file, 'com.microsoft.playwright'),
    timeUnit:
      importsFrom(file, 'java.util.concurrent.TimeUnit') && /^[A-Z]+$/u.test(wait.qualifier ?? ''),
    unqualified: wait.qualifier === undefined,
    shadowed: wait.qualifier === undefined && declared.has(wait.name),
  };
}

function isZeroTimes(outer) {
  return outer?.name === 'times' && outer.arguments.length === 1 && outer.arguments[0].text === '0';
}

function isMilliseconds(text) {
  return !DURATION_ARGUMENT.test(text) && DELAY_ARGUMENT.test(text);
}

function isDelay(wait) {
  return wait.arguments.length === 1 && DELAY_ARGUMENT.test(wait.arguments[0].text);
}

function isNegativeFollower(outer) {
  return NEGATIVE_FOLLOWERS.has(outer?.name) || isZeroTimes(outer);
}

function threadSleep(wait, context) {
  const qualifier = wait.qualifier ?? '';
  const known =
    THREAD_QUALIFIER.test(qualifier) ||
    TIME_UNIT_QUALIFIER.test(qualifier) ||
    context.timeUnit ||
    (context.unqualified && IMPORTED_SLEEP.test(wait.imported ?? ''));
  return wait.arguments.length <= SLEEP_ARGUMENTS && known ? fixed('sleep', true) : undefined;
}

const CLASSIFIERS = {
  sleep: threadSleep,
  parkNanos: (wait) =>
    LOCK_SUPPORT.test(wait.qualifier ?? '') || IMPORTED_PARK.test(wait.imported ?? '')
      ? fixed('sleep', true)
      : undefined,
  join: (wait, context) =>
    wait.arguments.length === 1 &&
    (wait.statement || isMilliseconds(wait.arguments[0].text)) &&
    !context.shadowed
      ? fixed('timed', true)
      : undefined,
  wait: (wait, context) =>
    wait.arguments.length >= 1 && !context.shadowed ? fixed('timed', true) : undefined,
  delay: (_wait, context) =>
    context.unqualified && !context.shadowed ? fixed('delay', true) : undefined,
  after: (wait, context) => {
    const mockitoCall = context.unqualified || MOCKITO_QUALIFIER.test(wait.qualifier ?? '');
    if (!context.mockito || context.shadowed || !mockitoCall || !isDelay(wait)) {
      return undefined;
    }
    return isNegativeFollower(wait.outer) ? negative : fixed('sleep');
  },
  waitForTimeout: (_wait, context) => (context.playwright ? fixed('sleep') : undefined),
  until: (wait, context) =>
    context.awaitility && wait.lambda === 'true' ? fixed('sleep') : undefined,
  during: (wait, context) =>
    context.awaitility && wait.arguments.length === 1 ? negative : undefined,
  continually: (_wait, context) => (context.kotest && context.unqualified ? negative : undefined),
};

function classify(wait, file, declared) {
  return CLASSIFIERS[wait.name]?.(wait, contextOf(file, wait, declared));
}

function isPolling(loop) {
  return loop.condition !== 'true' || loop.clock === true;
}

function runsInRunBlocking(wait) {
  const host = wait.scopes
    .filter((scope) => scope.k === 'lambda')
    .map((scope) => scope.host)
    .find((name) => name === 'runBlocking' || VIRTUAL_TIME_HOSTS.has(name));
  return host === 'runBlocking';
}

function ownerOf(wait) {
  return wait.scopes.find((scope) => TYPE_FRAMES.has(scope.k));
}

function isTestClass(owner, file) {
  return (
    owner.k === 'class' &&
    file.functions.some(
      (fn) =>
        insideClass(fn.owner, owner.qualified) &&
        fn.annotations.some((name) => TEST_ANNOTATIONS.has(name)),
    )
  );
}

function isSpared(wait, file, isProduction) {
  const [boundary] = wait.scopes.filter((scope) => BOUNDARIES.has(scope.k));
  const owner = ownerOf(wait);
  if (boundary?.k === 'loop' && isPolling(boundary)) {
    return true;
  }
  if (boundary?.k === 'lambda' && SPARED_HOSTS.has(boundary.host)) {
    return true;
  }
  if (
    boundary?.k === 'fun' &&
    boundary.name === 'run' &&
    owner?.supers.some((name) => THREAD_TYPES.has(name))
  ) {
    return true;
  }
  return (
    owner !== undefined &&
    !isTestClass(owner, file) &&
    owner.supers.some((name) => isProduction(name, file))
  );
}

export function waitMessage(found, awaitility = false) {
  const { rule, kind } = found;
  const tail = exceptionSentence(rule);
  if (rule === NEGATIVE_WAIT_RULE) {
    return `${NEGATIVE_MESSAGE}${tail}`;
  }
  if (kind === 'timed') {
    return timedWaitAdvice(awaitility);
  }
  if (kind === 'sleep' && awaitility) {
    return AWAITILITY_ADVICE;
  }
  return `${kind === 'sleep' ? SLEEP_MESSAGE : DELAY_MESSAGE}${tail}`;
}

function symbolOf(wait) {
  const fn = wait.scopes.find((scope) => scope.k === 'fun');
  const owner = ownerOf(wait);
  return [owner?.qualified ?? owner?.name, fn?.name].filter(Boolean).join('.');
}

function projectFunctionNames(files) {
  return new Set(files.flatMap((file) => file.functions.map(({ name }) => name)));
}

function isReported(found, wait, context) {
  if (found === undefined) {
    return false;
  }
  if (found.kind === 'delay' && !runsInRunBlocking(wait)) {
    return false;
  }
  return !(found.exemptable && isSpared(wait, context.file, context.isProduction));
}

export function testWaitFindings(files, { isProduction, finding, awaitility = false }) {
  const declared = projectFunctionNames(files);
  return files
    .filter(({ test }) => test)
    .flatMap((file) =>
      file.waits.flatMap((wait) => {
        const found = classify(wait, file, declared);
        if (!isReported(found, wait, { file, isProduction })) {
          return [];
        }
        const symbol = symbolOf(wait);
        return [
          finding({
            rule: found.rule,
            file: file.file,
            line: wait.line,
            symbol,
            key: `${symbol}:${wait.name}`,
            message: waitMessage(found, awaitility),
          }),
        ];
      }),
    );
}
