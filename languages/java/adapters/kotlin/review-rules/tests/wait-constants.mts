export const SLEEP_MESSAGE =
  'A fixed wait makes the test slow and flaky: Thread.sleep, TimeUnit sleep or parkNanos outside a polling loop, after(ms) with a check that could pass sooner, or pollDelay(...).until { true }. Wait on the condition: a loop that checks it against a deadline (a sleep inside that loop is allowed), or verify(mock, timeout(1000)) for a mock. A sleep in a mock answer, a thread body or a test fake that implements or extends a main class is allowed.';
export const DELAY_MESSAGE =
  'delay inside runBlocking waits for real, so the test is slow and flaky. Use runTest, where delay runs in virtual time and advanceTimeBy or advanceUntilIdle moves it, or wait on the condition in a loop against a deadline. A delay in a launch, async or flow body, a mock answer or a test fake that implements or extends a main class is allowed.';
export const NEGATIVE_MESSAGE =
  'Do not prove that something does not happen by waiting out a delay: after(ms).never(), during(...) and kotest continually pass only after the full wait, so the test is slow and depends on the timing. Give the code a Clock or a scheduler the test controls, move it past the delay and assert at once.';

export const SPARED_HOSTS: ReadonlySet<string> = new Set([
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
export const INLINE_HOSTS: ReadonlySet<string> = new Set([
  'run',
  'let',
  'also',
  'apply',
  'with',
  'repeat',
  'takeIf',
  'takeUnless',
  'use',
  'synchronized',
  'forEach',
  'forEachIndexed',
  'onEach',
]);
export const VIRTUAL_TIME_HOSTS: ReadonlySet<string> = new Set(['runTest', 'runBlockingTest']);
export const THREAD_TYPES: ReadonlySet<string> = new Set(['Thread', 'Runnable']);
export const NEGATIVE_FOLLOWERS: ReadonlySet<string> = new Set(['never', 'atMost', 'atMostOnce']);
export const IMPORTED_SLEEP = /^(?:java\.lang\.)?Thread\.sleep$/u;
export const IMPORTED_PARK = /(?:^|\.)LockSupport\.parkNanos$/u;
export const DURATION_ARGUMENT =
  /Duration|\.(?:nano|micro|milli)?seconds?\b|\.minutes?\b|\.hours?\b/u;
export const DELAY_ARGUMENT =
  /^(?:\d[\d_]*L?|[A-Z][A-Z0-9_]*|\w*(?:ms|[Mm]illis|[Tt]imeout|[Dd]elay)\w*|.+\.toLong\(\))$/u;
export const MOCKITO_QUALIFIER = /^(?:org\.mockito\.)?Mockito$/u;
export const THREAD_QUALIFIER = /^(?:java\.lang\.)?Thread$/u;
export const TIME_UNIT_QUALIFIER = /(?:^|\.)TimeUnit\.[A-Z]+$/u;
export const LOCK_SUPPORT = /(?:^|\.)LockSupport$/u;
export const BOUNDARIES: ReadonlySet<string> = new Set(['loop', 'lambda', 'fun', 'init']);
export const TYPE_FRAMES: ReadonlySet<string> = new Set(['class', 'object']);
export const TEST_ANNOTATIONS: ReadonlySet<string> = new Set([
  'Test',
  'ParameterizedTest',
  'RepeatedTest',
  'TestFactory',
  'TestTemplate',
]);
export const SLEEP_ARGUMENTS = 2;
export const SLEEP = 'sleep';
export const TIMED = 'timed';
export const LAMBDA = 'lambda';
