import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf } from '../../test-support/sources.mjs';
import { ESCAPING_RULE } from './escaping-launches.mjs';

const escapes = (text) => rulesOf(text, ESCAPING_RULE);
const junit = (members) => `${JUNIT_HEAD}class WorkerTest {
${members}
}
`;

describe('coroutines that escape a JUnit test', () => {
  it.each([
    [
      'reports CoroutineScope(...).launch and async that nothing waits for',
      junit(`    @Test
    fun launches() {
        CoroutineScope(Dispatchers.IO).launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun starts() {
        val deferred = CoroutineScope(Dispatchers.Default).async { worker.compute() }
        assertEquals(1, 1)
    }

    @Test
    fun insideRunTest() = runTest {
        CoroutineScope(Dispatchers.Default).launch { worker.run() }
        assertEquals(1, 1)
    }`),
      ['WorkerTest.launches@12', 'WorkerTest.starts@18', 'WorkerTest.insideRunTest@24'],
    ],
    [
      'reports a launch on a scope kept in a field or declared in the test',
      junit(`    private val scope = CoroutineScope(Dispatchers.IO)
    private lateinit var other: CoroutineScope

    @Test
    fun field() {
        scope.launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun lateinitField() {
        other.async { worker.compute() }
        assertEquals(1, 1)
    }

    @Test
    fun local() {
        val local = CoroutineScope(SupervisorJob())
        local.launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun thisField() {
        this.scope.launch { worker.run() }
        assertEquals(1, 1)
    }`),
      [
        'WorkerTest.field@15',
        'WorkerTest.lateinitField@21',
        'WorkerTest.local@28',
        'WorkerTest.thisField@34',
      ],
    ],
    [
      'reports a TestScope launch outside runTest and a launch on an imported GlobalScope alias',
      `${JUNIT_HEAD}import kotlinx.coroutines.GlobalScope as Forever

class WorkerTest {
    private val testScope = TestScope()

    @Test
    fun outside() {
        testScope.launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun aliased() {
        Forever.launch { worker.run() }
        assertEquals(1, 1)
    }
}
`,
      ['WorkerTest.outside@16', 'WorkerTest.aliased@22'],
    ],
    [
      'leaves GlobalScope to detekt GlobalCoroutineUsage',
      junit(`    @Test
    fun global() {
        GlobalScope.launch { worker.run() }
        assertEquals(1, 1)
    }`),
      [],
    ],
    [
      'allows launches inside runTest, runBlocking, coroutineScope and supervisorScope',
      junit(`    @Test
    fun a() = runTest {
        launch { worker.run() }
        val d = async { worker.compute() }
        assertEquals(1, d.await())
    }

    @Test
    fun b() = runBlocking {
        launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun c() = runTest {
        coroutineScope { launch { worker.run() } }
        supervisorScope { launch { worker.run() } }
        this.launch { worker.run() }
        backgroundScope.launch { worker.run() }
        assertEquals(1, 1)
    }`),
      [],
    ],
    [
      'allows a job that is joined and a deferred that is awaited, however it is named',
      junit(`    private val scope = CoroutineScope(Dispatchers.IO)

    @Test
    fun joined() = runTest {
        val job = scope.launch { worker.run() }
        job.join()
        assertEquals(1, 1)
    }

    @Test
    fun chained() = runTest {
        scope.launch { worker.run() }.join()
        assertEquals(1, scope.async { 1 }.await())
    }

    @Test
    fun several() = runTest {
        val jobs = (1..3).map { scope.launch { worker.run() } }
        jobs.joinAll()
        val values = (1..3).map { scope.async { it } }
        assertEquals(listOf(1, 2, 3), values.awaitAll())
    }

    @Test
    fun argument() = runTest {
        joinAll(scope.launch { worker.run() }, scope.launch { worker.run() })
        awaitAll(scope.async { 1 })
    }

    @Test
    fun mapped() = runTest {
        (1..3).map { scope.launch { worker.run() } }.joinAll()
        val collected = mutableListOf<Job>()
        collected.add(scope.launch { worker.run() })
        collected.forEach { it.join() }
    }

    @Test
    fun cancelled() = runTest {
        val job = scope.launch { worker.run() }
        job.cancelAndJoin()
    }

    @Test
    fun future() {
        val result = scope.future { 1 }
        assertEquals(1, result.get())
    }`),
      [],
    ],
    [
      'reports the launch that is not joined next to one that is',
      junit(`    private val scope = CoroutineScope(Dispatchers.IO)

    @Test
    fun partly() = runTest {
        val first = scope.launch { worker.run() }
        val second = scope.launch { worker.run() }
        first.join()
        assertEquals(1, 1)
    }`),
      ['WorkerTest.partly@15'],
    ],
    [
      'allows a test that waits through a latch, Awaitility or eventually of its own',
      junit(`    private val scope = CoroutineScope(Dispatchers.IO)

    @Test
    fun latch() {
        val latch = CountDownLatch(1)
        scope.launch { worker.run(); latch.countDown() }
        assertTrue(latch.await(1, TimeUnit.SECONDS))
    }

    @Test
    fun awaitility() {
        scope.launch { worker.run() }
        await().atMost(Duration.ofSeconds(1)).until { worker.done }
    }`),
      [],
    ],
    [
      'allows a scope that the test class cancels or joins after each test',
      junit(`    private val scope = CoroutineScope(Dispatchers.IO)
    private val other = CoroutineScope(Dispatchers.IO)

    @AfterEach
    fun tearDown() {
        scope.cancel()
    }

    @Test
    fun owned() {
        scope.launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun notOwned() {
        other.launch { worker.run() }
        assertEquals(1, 1)
    }`),
      ['WorkerTest.notOwned@26'],
    ],
    [
      'allows a TestScope that runTest or the test scheduler drives',
      junit(`    private val testScope = TestScope()

    @Test
    fun driven() = testScope.runTest {
        testScope.launch { worker.run() }
        assertEquals(1, 1)
    }

    @Test
    fun advanced() {
        testScope.launch { worker.run() }
        testScope.advanceUntilIdle()
        assertEquals(1, 1)
    }`),
      [],
    ],
    [
      'does not guess about a receiver it cannot resolve',
      junit(`    @Test
    fun unknown() {
        injected.scope.launch { worker.run() }
        provider().launch { worker.run() }
        helper.launch { worker.run() }
        assertEquals(1, 1)
    }

    fun helperLaunch() {
        CoroutineScope(Dispatchers.IO).launch { worker.run() }
    }`),
      [],
    ],
    [
      'reads only test functions, including parameterized and repeated ones',
      junit(`    @org.junit.jupiter.params.ParameterizedTest
    @ValueSource(ints = [1])
    fun param(value: Int) {
        CoroutineScope(Dispatchers.IO).launch { worker.run(value) }
        assertEquals(1, value)
    }

    @RepeatedTest(2)
    fun repeated() {
        CoroutineScope(Dispatchers.IO).launch { worker.run() }
        assertEquals(1, 1)
    }`),
      ['WorkerTest.param@13', 'WorkerTest.repeated@19'],
    ],
  ])('%s', (_name, text, expected) => {
    expect(escapes(text)).toEqual(expected);
  });
});

describe('coroutines that escape a Kotest test', () => {
  it.each([
    [
      'reports a scope launch in a leaf test, in every spec style',
      `${KOTEST_HEAD}class WorkerSpec : FunSpec({
    val scope = CoroutineScope(Dispatchers.IO)

    test("launches") {
        scope.launch { worker.run() }
        1 shouldBe 1
    }
    context("group") {
        test("starts") {
            CoroutineScope(Dispatchers.Default).async { worker.compute() }
            1 shouldBe 1
        }
    }
})

class TextSpec : StringSpec() {
    private val scope = CoroutineScope(Dispatchers.IO)

    init {
        "launches" {
            scope.launch { worker.run() }
            1 shouldBe 1
        }
    }
}
`,
      ['WorkerSpec > launches@11', 'WorkerSpec > group > starts@16', 'TextSpec > launches@27'],
    ],
    [
      'allows the structured forms a Kotest body gives',
      `${KOTEST_HEAD}class WorkerSpec : FunSpec({
    val scope = CoroutineScope(Dispatchers.IO)

    test("structured") {
        launch { worker.run() }
        coroutineScope { launch { worker.run() } }
        1 shouldBe 1
    }
    test("joined") {
        val job = scope.launch { worker.run() }
        job.join()
        1 shouldBe 1
    }
    test("inside runTest") {
        runTest {
            backgroundScope.launch { worker.run() }
            launch { worker.run() }
        }
    }
    test("awaited") {
        scope.async { 1 }.await() shouldBe 1
    }
    test("eventually") {
        scope.launch { worker.run() }
        eventually(1.seconds) { worker.done shouldBe true }
    }
})
`,
      [],
    ],
    [
      'allows a scope cancelled in afterSpec and reports the one nothing cancels',
      `${KOTEST_HEAD}class WorkerSpec : FunSpec({
    val scope = CoroutineScope(Dispatchers.IO)
    val other = CoroutineScope(Dispatchers.IO)

    afterSpec { scope.cancel() }

    test("owned") {
        scope.launch { worker.run() }
        1 shouldBe 1
    }
    test("not owned") {
        other.launch { worker.run() }
        1 shouldBe 1
    }
})
`,
      ['WorkerSpec > not owned@18'],
    ],
    [
      'reports a launch in an AnnotationSpec test as in JUnit',
      `${KOTEST_HEAD}class LegacySpec : AnnotationSpec() {
    private val scope = CoroutineScope(Dispatchers.IO)

    @Test
    fun launches() {
        scope.launch { worker.run() }
        1 shouldBe 1
    }
}
`,
      ['LegacySpec.launches@12'],
    ],
  ])('%s', (_name, text, expected) => {
    expect(escapes(text)).toEqual(expected);
  });
});
