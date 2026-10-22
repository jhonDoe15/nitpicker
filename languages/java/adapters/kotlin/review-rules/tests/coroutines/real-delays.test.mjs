import { describe, expect, it } from 'vitest';
import { FIXED_SLEEP_RULE } from '../../../../../messages/wait-advice.mjs';
import {
  flagsFor,
  JUNIT_HEAD,
  KOTEST_HEAD,
  project,
  rulesOf,
} from '../../test-support/sources.mjs';

const delays = (text, flags) => rulesOf(text, FIXED_SLEEP_RULE, flags);
const junit = (members, extra = '') => `${JUNIT_HEAD}${extra}class ClockTest {
${members}
}
`;

describe('delay on a real dispatcher inside runTest', () => {
  it.each([
    [
      'reports delay inside withContext on a real dispatcher',
      junit(`    @Test
    fun io() = runTest {
        withContext(Dispatchers.IO) { delay(500) }
        assertEquals(1, 1)
    }

    @Test
    fun default() = runTest {
        withContext(Dispatchers.Default) {
            delay(500)
        }
    }

    @Test
    fun unconfined() = runTest {
        withContext(Dispatchers.Unconfined + CoroutineName("x")) { delay(500) }
    }

    @Test
    fun threads() = runTest {
        withContext(newSingleThreadContext("worker")) { delay(500) }
        withContext(Executors.newFixedThreadPool(2).asCoroutineDispatcher()) { delay(500) }
    }`),
      [
        'ClockTest.io@12',
        'ClockTest.default@19',
        'ClockTest.unconfined@25',
        'ClockTest.threads@30',
        'ClockTest.threads@31',
      ],
    ],
    [
      'follows a dispatcher stored in a property or a local',
      junit(
        `    private val io = Dispatchers.IO
    private val executor = Executors.newSingleThreadExecutor().asCoroutineDispatcher()

    @Test
    fun property() = runTest {
        withContext(io) { delay(500) }
        withContext(executor) { delay(500) }
    }

    @Test
    fun local() = runTest {
        val worker = newSingleThreadContext("worker")
        withContext(worker) { delay(500) }
    }`,
      ),
      ['ClockTest.property@15', 'ClockTest.property@16', 'ClockTest.local@22'],
    ],
    [
      'reports delay in an inline lambda or an if inside the real block',
      junit(`    @Test
    fun nested() = runTest {
        withContext(Dispatchers.IO) {
            repeat(3) { delay(10) }
            if (flag) {
                delay(10)
            }
            withTimeout(5000) { delay(10) }
        }
    }`),
      ['ClockTest.nested@13', 'ClockTest.nested@15', 'ClockTest.nested@17'],
    ],
    [
      'allows delay in virtual time',
      junit(`    @Test
    fun plain() = runTest {
        delay(500)
        advanceTimeBy(500)
    }

    @Test
    fun unconfined() = runTest(UnconfinedTestDispatcher()) {
        delay(500)
    }

    @Test
    fun explicit() = runTest {
        withContext(StandardTestDispatcher(testScheduler)) { delay(500) }
        withContext(UnconfinedTestDispatcher(testScheduler)) { delay(500) }
    }

    @Test
    fun stored() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        withContext(dispatcher) { delay(500) }
    }

    @Test
    fun property() = runTest {
        withContext(testDispatcher) { delay(500) }
    }

    @Test
    fun neutral() = runTest {
        withContext(CoroutineName("x")) { delay(500) }
        withContext(NonCancellable) { delay(500) }
    }`),
      [],
    ],
    [
      'allows a virtual block inside a real one and a runTest inside withContext',
      junit(`    @Test
    fun virtualInside() = runTest {
        withContext(Dispatchers.IO) {
            withContext(StandardTestDispatcher(testScheduler)) { delay(500) }
        }
    }

    @Test
    fun runTestInside() {
        runBlocking(Dispatchers.IO) {
            runTest { delay(500) }
        }
    }`),
      [],
    ],
    [
      'allows cooperative suspension, polling against a deadline and background latency',
      junit(`    @Test
    fun cooperative() = runTest {
        withContext(Dispatchers.IO) { yield() }
        withContext(Dispatchers.IO) { ensureActive() }
    }

    @Test
    fun polling() = runTest {
        withContext(Dispatchers.IO) {
            val deadline = System.nanoTime() + 1_000_000_000L
            while (!done && System.nanoTime() < deadline) {
                delay(10)
            }
            while (!ready) {
                delay(10)
            }
            for (attempt in 1..5) {
                delay(10)
            }
        }
    }

    @Test
    fun background() = runTest {
        withContext(Dispatchers.IO) {
            launch { delay(500) }
            async { delay(500) }
            flow { delay(500); emit(1) }
        }
        whenever(service.call()).thenAnswer { runBlocking { delay(500) } }
    }

    @Test
    fun fake() = runTest {
        withContext(Dispatchers.IO) {
            val slow = object : Service {
                override suspend fun call() { delay(500) }
            }
            useIt(slow)
        }
    }`),
      [],
    ],
    [
      'leaves delay inside runBlocking to the runBlocking rule',
      junit(`    @Test
    fun blocking() = runBlocking {
        withContext(Dispatchers.IO) { delay(500) }
    }

    @Test
    fun nested() = runTest {
        runBlocking {
            withContext(Dispatchers.IO) { delay(500) }
        }
    }`),
      [],
    ],
  ])('%s', (_name, text, expected) => {
    expect(delays(text)).toEqual(expected);
  });

  it('reports Dispatchers.Main only when no test dispatcher replaces it', () => {
    const text = junit(`    @Test
    fun main() = runTest {
        withContext(Dispatchers.Main) { delay(500) }
    }`);
    const replaced = `class Rule { fun starting() { Dispatchers.setMain(StandardTestDispatcher()) } }`;

    expect(delays(text)).toEqual(['ClockTest.main@12']);
    expect(delays(text, flagsFor([text, replaced]))).toEqual([]);
  });

  it('does not guess about a dispatcher it cannot resolve or a delay the project redefines', () => {
    const text = junit(`    @Test
    fun unknown(dispatcher: CoroutineDispatcher) = runTest {
        withContext(dispatcher) { delay(500) }
        withContext(injected.dispatcher) { delay(500) }
        withContext(provider()) { delay(500) }
    }

    @Test
    fun mixed() = runTest {
        withContext(Dispatchers.IO + testDispatcher) { delay(500) }
    }`);
    const real = junit(`    @Test
    fun io() = runTest {
        withContext(Dispatchers.IO) { delay(500) }
    }`);

    expect(delays(text)).toEqual([]);
    expect(delays(real, project({ functionNames: new Set(['delay']) }))).toEqual([]);
  });
});

describe('delay in a Kotest test body', () => {
  it('reports delay in a test body that is not in virtual time', () => {
    const text = `${KOTEST_HEAD}class ClockSpec : FunSpec({
    test("waits") {
        delay(500)
        1 shouldBe 1
    }
    context("group") {
        test("switches") {
            withContext(Dispatchers.IO) { delay(500) }
        }
    }
})

class TextSpec : StringSpec({
    "waits" { delay(500) }
})
`;

    expect(delays(text)).toEqual([
      'ClockSpec > waits@9',
      'ClockSpec > group > switches@14',
      'TextSpec > waits@20',
    ]);
  });

  it('allows runTest, background work, runBlocking (judged by the runBlocking rule) and a project that runs specs in a test scope', () => {
    const text = `${KOTEST_HEAD}class ClockSpec : FunSpec({
    test("virtual") {
        runTest { delay(500) }
    }
    test("background") {
        launch { delay(500) }
    }
    test("polling") {
        while (!done) { delay(10) }
    }
    test("blocking") {
        runBlocking { delay(500) }
    }
})
`;
    const waits = `${KOTEST_HEAD}class WaitSpec : FunSpec({
    test("waits") { delay(500) }
})
`;
    const scoped = `class ProjectConfig : AbstractProjectConfig() {
    override val coroutineTestScope = true
}
`;

    expect(delays(text)).toEqual([]);
    expect(delays(waits)).toEqual(['WaitSpec > waits@8']);
    expect(delays(waits, flagsFor([waits, scoped]))).toEqual([]);
  });
});
