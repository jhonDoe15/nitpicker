import { describe, expect, it } from 'vitest';
import { FIXED_SLEEP_RULE } from '../../../../../../messages/wait-advice.mjs';
import { flagsFor, JUNIT_HEAD, KOTEST_HEAD, rulesOf } from '../../../test-support/sources.mjs';

const delays = (text, flags) => rulesOf(text, FIXED_SLEEP_RULE, flags);
const junit = (members, extra = '') => `${JUNIT_HEAD}${extra}class ClockTest {
${members}
}
`;

describe('delay on a real dispatcher in a JUnit test', () => {
  it.each([
    [
      'inside withContext on a real dispatcher',
      junit(`    @Test
    fun io() = runTest {
        withContext(Dispatchers.IO) { delay(500) }
    }

    @Test
    fun others() = runTest {
        withContext(Dispatchers.Unconfined + CoroutineName("x")) { delay(500) }
        withContext(newSingleThreadContext("worker")) { delay(500) }
        withContext(Executors.newFixedThreadPool(2).asCoroutineDispatcher()) { delay(500) }
        withContext(testDispatcher + Dispatchers.IO) { delay(500) }
    }`),
      [12, 17, 18, 19, 20].map(
        (line) => `ClockTest.${line === 12 ? 'io' : 'others'}@${String(line)}`,
      ),
    ],
    [
      'a dispatcher from a property, a local, a constructor default or a later assignment',
      `${JUNIT_HEAD}class ClockTest(private val io: CoroutineDispatcher = Dispatchers.IO) {
    private val executor = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    private lateinit var worker: CoroutineDispatcher

    @BeforeEach
    fun setUp() {
        worker = Dispatchers.Default
    }

    @Test
    fun fields() = runTest {
        withContext(io) { delay(500) }
        withContext(executor) { delay(500) }
        withContext(worker) { delay(500) }
        val local = newSingleThreadContext("worker")
        withContext(local) { delay(500) }
    }
}
`,
      ['ClockTest.fields@20', 'ClockTest.fields@21', 'ClockTest.fields@22', 'ClockTest.fields@24'],
    ],
    [
      'runTest on a real dispatcher and a launch or async on one that the test waits for',
      junit(`    @Test
    fun runner() = runTest(Dispatchers.IO) {
        delay(500)
    }

    @Test
    fun waited() = runTest {
        async(Dispatchers.Default) { delay(5000) }.await()
        launch(Dispatchers.Default) { delay(5000) }.join()
        val job = launch(Dispatchers.IO) { delay(500) }
        job.join()
    }`),
      ['ClockTest.runner@12', 'ClockTest.waited@17', 'ClockTest.waited@18', 'ClockTest.waited@19'],
    ],
    [
      'a delay repeated in a loop that does not wait for a condition, braced or not',
      junit(`    @Test
    fun loops() = runTest {
        withContext(Dispatchers.IO) {
            for (i in 1..5) { delay(1000) }
            for (i in 1..5) delay(1000)
            while (1 < 2) {
                delay(10)
                break
            }
            do {
                delay(10)
            } while (false)
            repeat(3) { delay(10) }
        }
    }`),
      [13, 14, 16, 20, 22].map((line) => `ClockTest.loops@${String(line)}`),
    ],
    [
      'an aliased or qualified kotlinx delay',
      junit(
        `    @Test
    fun aliased() = runTest {
        withContext(Dispatchers.IO) { wait(500) }
        withContext(Dispatchers.IO) { kotlinx.coroutines.delay(500) }
    }`,
        'import kotlinx.coroutines.delay as wait\n',
      ),
      ['ClockTest.aliased@13', 'ClockTest.aliased@14'],
    ],
    [
      'a test helper that waits on a real dispatcher',
      junit(`    @Test
    fun usesHelper() = runTest { pause() }

    private suspend fun pause() = withContext(Dispatchers.IO) { delay(500) }

    private suspend fun waitABit() {
        delay(500)
    }`),
      ['ClockTest.pause@13'],
    ],
  ])('reports %s', (_name, text, expected) => {
    expect(delays(text)).toEqual(expected);
  });

  it.each([
    [
      'delay in virtual time, on a test dispatcher or on a context that adds no dispatcher',
      junit(`    @Test
    fun virtual() = runTest {
        delay(500)
        advanceTimeBy(500)
        withContext(StandardTestDispatcher(testScheduler)) { delay(500) }
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        withContext(dispatcher) { delay(500) }
        withContext(testDispatcher) { delay(500) }
        withContext(CoroutineName("x")) { delay(500) }
        withContext(NonCancellable) { delay(500) }
        withContext(Dispatchers.Default + testDispatcher) { delay(500) }
    }

    @Test
    fun unconfined() = runTest(UnconfinedTestDispatcher()) {
        delay(500)
    }

    @Test
    fun nested() = runTest {
        withContext(Dispatchers.IO) {
            withContext(StandardTestDispatcher(testScheduler)) { delay(500) }
        }
    }`),
    ],
    [
      'cooperative suspension, polling on a condition or a deadline, braced or not',
      junit(`    @Test
    fun polling() = runTest {
        withContext(Dispatchers.IO) {
            yield()
            ensureActive()
            val deadline = System.nanoTime() + 1_000_000_000L
            while (!done && System.nanoTime() < deadline) {
                delay(10)
            }
            while (!ready()) delay(10)
            while (!ready()) { delay(10) }
            for (attempt in 1..5) {
                if (ready()) break
                delay(10)
            }
            do {
                delay(10)
            } while (!ready())
        }
    }`),
    ],
    [
      'background work the test does not wait for, a mock answer and a fake',
      junit(`    @Test
    fun background() = runTest {
        withContext(Dispatchers.IO) {
            launch { delay(500) }
            async { delay(500) }
            flow { delay(500); emit(1) }
        }
        launch(Dispatchers.IO) { delay(500) }
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
    ],
    [
      'delay inside runBlocking, which the runBlocking rule judges',
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
    ],
    [
      'a dispatcher it cannot resolve',
      junit(`    @Test
    fun unknown(dispatcher: CoroutineDispatcher) = runTest {
        withContext(dispatcher) { delay(500) }
        withContext(injected.dispatcher) { delay(500) }
        withContext(provider()) { delay(500) }
    }`),
    ],
    [
      'a delay that this file or its package defines',
      junit(`    @Test
    fun own() = runTest {
        withContext(Dispatchers.IO) { delay(500) }
    }

    private suspend fun delay(millis: Long) = Unit`),
    ],
  ])('allows %s', (_name, text) => {
    expect(delays(text)).toEqual([]);
  });

  it('resolves delay per file and package, not from any test file of the project', () => {
    const text = junit(`    @Test
    fun io() = runTest {
        withContext(Dispatchers.IO) { delay(500) }
    }`);
    const elsewhere = 'package other\n\nfun delay(millis: Long) = Unit\n';
    const samePackage = 'package demo\n\nfun delay(millis: Long) = Unit\n';

    expect(delays(text, flagsFor([text, elsewhere]))).toEqual(['ClockTest.io@12']);
    expect(delays(text, flagsFor([text, samePackage]))).toEqual([]);
  });
});

describe('Dispatchers.Main and a test Main dispatcher', () => {
  const MAIN = junit(`    @Test
    fun main() = runTest {
        withContext(Dispatchers.Main) { delay(500) }
    }`);
  const RULE = `package demo

class MainCoroutineRule : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(StandardTestDispatcher())
    }
}
`;
  const applied = (annotation, member = '') => `${JUNIT_HEAD}${annotation}class ClockTest${member} {
    @Test
    fun main() = runTest {
        withContext(Dispatchers.Main) { delay(500) }
    }
}
`;

  it.each([
    ['no rule at all', MAIN, [MAIN]],
    ['a rule that is declared but not applied to the test class', MAIN, [MAIN, RULE]],
  ])('reports with %s', (_name, text, files) => {
    expect(delays(text, flagsFor(files))).toEqual(['ClockTest.main@12']);
  });

  it.each([
    [
      'a rule field',
      applied('', '').replace('{\n', '{\n    @get:Rule val main = MainCoroutineRule()\n'),
    ],
    ['an extension', applied('@ExtendWith(MainCoroutineRule::class)\n')],
    ['a base class that applies it', applied('', ' : CoroutineTest()')],
    [
      'a direct setMain',
      applied('', '').replace(
        '{\n',
        '{\n    init { Dispatchers.setMain(UnconfinedTestDispatcher()) }\n',
      ),
    ],
  ])('allows %s', (_name, text) => {
    const base =
      'package demo\n\nabstract class CoroutineTest {\n    @get:Rule val main = MainCoroutineRule()\n}\n';
    expect(delays(text, flagsFor([text, RULE, base]))).toEqual([]);
  });
});

describe('delay in a Kotest test body', () => {
  const WAITS = `${KOTEST_HEAD}class WaitSpec : FunSpec({
    test("waits") { delay(500) }
})
`;

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

  it('allows runTest, background work, polling and runBlocking', () => {
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

    expect(delays(text)).toEqual([]);
  });

  it.each([
    [
      'a project config that turns the test scope on',
      'class ProjectConfig : AbstractProjectConfig() {\n    override val coroutineTestScope = true\n}\n',
      [],
    ],
    [
      'a project config that turns it off',
      'class ProjectConfig : AbstractProjectConfig() {\n    override val coroutineTestScope = false\n}\n',
      ['WaitSpec > waits@8'],
    ],
  ])('judges %s', (_name, config, expected) => {
    expect(delays(WAITS, flagsFor([WAITS, config]))).toEqual(expected);
  });

  it('reads coroutineTestScope on the spec and on the test', () => {
    const text = `${KOTEST_HEAD}class ScopedSpec : FunSpec({
    coroutineTestScope = true
    test("waits") { delay(500) }
})

class TestScopedSpec : FunSpec({
    test("waits").config(coroutineTestScope = true) { delay(500) }
    test("real") { delay(500) }
})
`;

    expect(delays(text)).toEqual(['TestScopedSpec > real@14']);
  });
});
