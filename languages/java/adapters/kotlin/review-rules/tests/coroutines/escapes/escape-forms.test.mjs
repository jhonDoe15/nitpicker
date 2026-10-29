import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf } from '../../../test-support/sources.mjs';
import { ESCAPING_RULE } from './escaping-launches.mjs';

const escapes = (text) => rulesOf(text, ESCAPING_RULE);
const junit = (members) => `${JUNIT_HEAD}class WorkerTest {
    private val scope = CoroutineScope(Dispatchers.IO)

${members}
}
`;

describe('scopes the test drives and launches the test waits for', () => {
  it.each([
    [
      'a scope built on a test dispatcher or on the test context',
      junit(`    private val testDispatcher = StandardTestDispatcher()
    private val fieldScope = CoroutineScope(testDispatcher)

    @Test
    fun driven() {
        val local = CoroutineScope(StandardTestDispatcher(testScheduler))
        local.launch { worker.run() }
        fieldScope.launch { worker.run() }
        CoroutineScope(UnconfinedTestDispatcher()).launch { worker.run() }
        testDispatcher.scheduler.advanceUntilIdle()
    }

    @Test
    fun context() = runTest {
        CoroutineScope(coroutineContext).launch { worker.run() }
        runCurrent()
    }`),
    ],
    [
      'a deferred whose chain starts on the next line',
      junit(`    @Test
    fun chained() = runTest {
        val second = scope
            .async { 2 }
        assertEquals(2, second.await())
    }`),
    ],
    [
      'jobs and deferreds kept in a collection that is joined or awaited',
      junit(`    @Test
    fun collections() = runTest {
        val jobs = listOf(scope.launch { worker.run() })
        jobs.first().join()
        val values = (1..3).map { scope.async { it } }
        assertEquals(6, values.sumOf { it.await() })
        val more = List(2) { scope.async { it } }
        assertTrue(more.all { it.await() >= 0 })
        val indexed = List(2) { scope.async { it } }
        indexed[1].await()
        val list = List(2) { scope.launch { worker.run() } }
        for (job in list) job.join()
        val all = List(2) { scope.async { it } }
        all.awaitAll()
    }`),
    ],
    [
      'a latch or a deferred that the launched block completes and the test awaits after it',
      junit(`    @Test
    fun latch() {
        val latch = CountDownLatch(1)
        scope.launch { worker.run(); latch.countDown() }
        assertTrue(latch.await(1, TimeUnit.SECONDS))
    }

    @Test
    fun deferred() = runTest {
        val done = CompletableDeferred<Unit>()
        scope.launch { done.complete(Unit) }
        done.await()
    }`),
    ],
    [
      'a scope whose children the class cancels after each test',
      junit(`    @AfterEach
    fun tearDown() {
        scope.coroutineContext.cancelChildren()
    }

    @Test
    fun owned() {
        scope.launch { worker.run() }
    }`),
    ],
  ])('allows %s', (_name, text) => {
    expect(escapes(text)).toEqual([]);
  });

  it.each([
    [
      'a latch or a future that is only mentioned, or awaited before the launch',
      junit(`    @Test
    fun mentioned() {
        val future = CompletableFuture<Int>()
        scope.launch { worker.run() }
        assertNotNull(future)
    }

    @Test
    fun awaitedBefore() {
        val latch = CountDownLatch(1)
        latch.await(1, TimeUnit.SECONDS)
        scope.launch { worker.run() }
    }`),
      ['WorkerTest.mentioned@15', 'WorkerTest.awaitedBefore@23'],
    ],
    [
      'launches through with, run, apply and also, a scope from a helper and an Android scope',
      junit(`    private fun newScope() = CoroutineScope(SupervisorJob())

    @Test
    fun scoped() {
        with(CoroutineScope(Job())) { launch { worker.run() } }
        CoroutineScope(Job()).run { launch { worker.run() } }
        CoroutineScope(Job()).apply { async { worker.compute() } }
        CoroutineScope(Job()).also { it.launch { worker.run() } }
        newScope().launch { worker.run() }
        viewModel.viewModelScope.launch { worker.run() }
    }`),
      [16, 17, 18, 19, 20, 21].map((line) => `WorkerTest.scoped@${String(line)}`),
    ],
    [
      'a flow started in a scope of its own',
      junit(`    @Test
    fun flows() {
        events.launchIn(scope)
        val state = events.stateIn(scope, SharingStarted.Eagerly, 0)
        val shared = events.shareIn(CoroutineScope(Job()), SharingStarted.Eagerly)
    }`),
      ['WorkerTest.flows@14', 'WorkerTest.flows@15', 'WorkerTest.flows@16'],
    ],
  ])('reports %s', (_name, text, expected) => {
    expect(escapes(text)).toEqual(expected);
  });

  it('matches teardown by the scope and by the class of the test', () => {
    const text = `${JUNIT_HEAD}class FirstTest {
    private val scope = CoroutineScope(Dispatchers.IO)

    @AfterEach
    fun tearDown() {
        scope.cancel()
    }

    @Test
    fun owned() {
        scope.launch { worker.run() }
    }
}

class SecondTest {
    private val scope = CoroutineScope(Dispatchers.IO)

    @AfterEach
    fun tearDown() {
        println(scope.isActive)
    }

    @Test
    fun notOwned() {
        scope.launch { worker.run() }
    }
}
`;

    expect(escapes(text)).toEqual(['SecondTest.notOwned@33']);
  });
});
