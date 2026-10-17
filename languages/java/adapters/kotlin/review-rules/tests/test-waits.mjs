import { importsFrom, insideClass } from '../kotlin-facts.mjs';
import { exceptionSentence } from '../review-finding.mjs';

export const FIXED_SLEEP_RULE = 'FixedSleepInTest';
export const NEGATIVE_WAIT_RULE = 'NegativeWaitInTest';

const SLEEP_MESSAGE =
  'A fixed wait makes the test slow and flaky: Thread.sleep, TimeUnit sleep or parkNanos outside a polling loop, after(ms) with a check that could pass sooner, or pollDelay(...).until { true }. Wait on the condition: a loop that checks it against a deadline (a sleep inside that loop is allowed), Awaitility until, or verify(mock, timeout(1000)) for a mock. A sleep in a mock answer, a thread body or a test fake that implements or extends a main class is allowed. If a real wait is unavoidable, ';
const DELAY_MESSAGE =
  'delay inside runBlocking waits for real, so the test is slow and flaky. Use runTest, where delay runs in virtual time and advanceTimeBy or advanceUntilIdle moves it, or wait on the condition in a loop against a deadline. A delay in a launch, async or flow body, a mock answer or a test fake that implements or extends a main class is allowed. If a real wait is unavoidable, ';
const TIMED_MESSAGE =
  'A timed wait, join(ms) or wait(ms), returns as soon as the thread ends or is notified, so it does not slow a passing test, but it also returns when the time runs out, and the test then goes on as if the wait had succeeded. Check the outcome: assertTrue(thread.join(Duration.ofSeconds(5))) for a thread, or assert the result of CountDownLatch.await(5, SECONDS); call wait(ms) only in a loop that checks its condition against a deadline. If going on after the timeout is intended, ';
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
const CLOCK = /nanoTime|currentTimeMillis|Instant\.now|markNow|elapsedNow|TimeSource|Clock\b|measureTime/u;
const THREAD_QUALIFIER = /^(?:java\.lang\.)?Thread$/u;
const TIME_UNIT_QUALIFIER = /(?:^|\.)TimeUnit\.[A-Z]+$/u;
const LOCK_SUPPORT = /(?:^|\.)LockSupport$/u;
const BOUNDARIES = new Set(['loop', 'lambda', 'fun', 'init']);
const TYPE_FRAMES = new Set(['class', 'object']);
const TEST_ANNOTATIONS = new Set(['Test', 'ParameterizedTest', 'RepeatedTest', 'TestFactory', 'TestTemplate']);
const SLEEP_ARGUMENTS = 2;
const SINGLE_ARGUMENT = 1;

function importedNameOf(file, wait) {
  return {
    mockito: importsFrom(file, 'org.mockito'),
    awaitility: importsFrom(file, 'org.awaitility'),
    kotest: importsFrom(file, 'io.kotest'),
    playwright: importsFrom(file, 'com.microsoft.playwright'),
    timeUnit: importsFrom(file, 'java.util.concurrent.TimeUnit') && /^[A-Z]+$/u.test(wait.qualifier ?? ''),
  };
}

function isZeroTimes(outer) {
  return outer?.name === 'times' && outer.arguments.length === 1 && outer.arguments[0].text === '0';
}

function classify(wait, file, declared) {
  const imports = importedNameOf(file, wait);
  const unqualified = wait.qualifier === null;
  const shadowed = unqualified && declared.has(wait.name);
  switch (wait.name) {
    case 'sleep':
      return wait.arguments.length <= SLEEP_ARGUMENTS &&
        (THREAD_QUALIFIER.test(wait.qualifier ?? '') ||
          TIME_UNIT_QUALIFIER.test(wait.qualifier ?? '') ||
          imports.timeUnit)
        ? { rule: FIXED_SLEEP_RULE, kind: 'sleep', exemptable: true }
        : undefined;
    case 'parkNanos':
      return LOCK_SUPPORT.test(wait.qualifier ?? '')
        ? { rule: FIXED_SLEEP_RULE, kind: 'sleep', exemptable: true }
        : undefined;
    case 'join':
      return wait.arguments.length === SINGLE_ARGUMENT && wait.statement && !shadowed
        ? { rule: FIXED_SLEEP_RULE, kind: 'timed', exemptable: true }
        : undefined;
    case 'wait':
      return wait.arguments.length >= SINGLE_ARGUMENT && !shadowed
        ? { rule: FIXED_SLEEP_RULE, kind: 'timed', exemptable: true }
        : undefined;
    case 'delay':
      return unqualified && !shadowed
        ? { rule: FIXED_SLEEP_RULE, kind: 'delay', exemptable: true }
        : undefined;
    case 'after':
      return imports.mockito && !shadowed
        ? {
            rule:
              NEGATIVE_FOLLOWERS.has(wait.outer?.name) || isZeroTimes(wait.outer)
                ? NEGATIVE_WAIT_RULE
                : FIXED_SLEEP_RULE,
            kind: 'sleep',
          }
        : undefined;
    case 'waitForTimeout':
      return imports.playwright ? { rule: FIXED_SLEEP_RULE, kind: 'sleep' } : undefined;
    case 'until':
      return imports.awaitility && wait.lambda === 'true'
        ? { rule: FIXED_SLEEP_RULE, kind: 'sleep' }
        : undefined;
    case 'during':
      return imports.awaitility ? { rule: NEGATIVE_WAIT_RULE, kind: 'negative' } : undefined;
    case 'continually':
      return imports.kotest && unqualified ? { rule: NEGATIVE_WAIT_RULE, kind: 'negative' } : undefined;
    default:
      return undefined;
  }
}

function isPolling(loop) {
  return loop.condition !== 'true' || CLOCK.test(loop.text);
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
  if (boundary?.k === 'fun' && boundary.name === 'run' && owner?.supers.some((name) => THREAD_TYPES.has(name))) {
    return true;
  }
  return (
    owner !== undefined &&
    !isTestClass(owner, file) &&
    owner.supers.some((name) => isProduction(name, file))
  );
}

function messageOf(found, rule) {
  const tail = exceptionSentence(rule);
  if (rule === NEGATIVE_WAIT_RULE) {
    return `${NEGATIVE_MESSAGE}${tail}`;
  }
  const messages = { sleep: SLEEP_MESSAGE, delay: DELAY_MESSAGE, timed: TIMED_MESSAGE };
  return `${messages[found.kind]}${tail}`;
}

function symbolOf(wait) {
  const fn = wait.scopes.find((scope) => scope.k === 'fun');
  const owner = ownerOf(wait);
  return [owner?.qualified ?? owner?.name, fn?.name].filter(Boolean).join('.');
}

function projectFunctionNames(files) {
  return new Set(files.flatMap((file) => file.functions.map(({ name }) => name)));
}

function isReported(found, wait, file, isProduction) {
  if (found === undefined) {
    return false;
  }
  if (found.kind === 'delay' && !runsInRunBlocking(wait)) {
    return false;
  }
  return !(found.exemptable === true && isSpared(wait, file, isProduction));
}

export function testWaitFindings(files, { isProduction, finding }) {
  const declared = projectFunctionNames(files);
  return files
    .filter(({ test }) => test)
    .flatMap((file) =>
      file.waits.flatMap((wait) => {
        const found = classify(wait, file, declared);
        if (!isReported(found, wait, file, isProduction)) {
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
            message: messageOf(found, found.rule),
          }),
        ];
      }),
    );
}
