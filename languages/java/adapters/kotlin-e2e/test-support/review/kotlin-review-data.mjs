const MAIN = 'src/main/kotlin/demo/orders';
const TEST = 'src/test/kotlin/demo/orders';
const SPRING = 'src/test/kotlin/org/springframework';

const STATUS = `package demo.orders

enum class Status { NEW, PAID, SHIPPED, CANCELLED }
`;

const CLOCK = `package demo.orders

interface Clock {
    fun now(): Long
}
`;

const SETTLEMENT = `package demo.orders

fun isSettled(status: Status) = status == Status.PAID || status == Status.SHIPPED

fun isOpen(status: Status): Boolean = status in setOf(Status.NEW, Status.PAID)

fun isFinal(status: Status): Boolean =
    when (status) {
        Status.NEW, Status.PAID -> false
        Status.SHIPPED, Status.CANCELLED -> true
    }

val Status.isLive: Boolean get() = this == Status.NEW || this == Status.PAID

fun weight(status: Status) = if (status == Status.NEW || status == Status.PAID) 1 else 0

fun absOf(value: Int) = Math.abs(value)

fun total(cents: Int) = scaled(cents)

fun scaled(cents: Int): Int = cents * 2

data class Query(val tag: String, val tags: List<String>)

data class Page(val tag: String, val size: Int)
`;

const FORMATTING = `package demo.orders

private fun pad(value: Int, width: Int = 2): String = value.toString().padStart(width)

private fun label(value: Int, prefix: String = "n"): String = prefix + value

internal class Mailer(private val host: String, private val retries: Int = 3) {
    fun send(): String = host + retries
}

internal data class Envelope(val id: String, val retries: Int = 3)

fun report(): String = pad(1) + label(2) + Mailer("h").send() + label(3, "m") + Envelope("e").id
`;

const INVENTORY = `package demo.orders

import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.util.concurrent.Executors
import java.util.logging.Logger

private val log: Logger = Logger.getLogger("inventory")
val stockFile: Path = Path.of("stock.csv")
val seeded: Boolean = Files.exists(stockFile)
val stockLines: List<String> by lazy { Files.readAllLines(stockFile) }

object Inventory {
    val workers = Executors.newFixedThreadPool(2)

    fun connection(): Connection {
        log.fine("connecting")
        return DriverManager.getConnection("jdbc:h2:mem:inventory")
    }
}

enum class Shelf(val file: String) {
    TOP("top.csv"),
    BOTTOM("bottom.csv"),
    ;

    val present: Boolean = Files.exists(Path.of(file))
}
`;

const WAITING_TEST = `package demo.orders

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class SlowClock : Clock {
    override fun now(): Long {
        Thread.sleep(1)
        return 1L
    }
}

class WaitingTest {
    @Test
    fun sleeps() {
        Thread.sleep(1)
        runBlocking { delay(1) }
        assertEquals(1L, SlowClock().now())
    }

    @Test
    fun iterates() {
        for (name in listOf("a", "b")) {
            Thread.sleep(1)
        }
        assertEquals(1L, SlowClock().now())
    }

    @Test
    fun waitsOnTheCondition() {
        var done = false
        Thread { done = true }.start()
        val deadline = System.nanoTime() + 5_000_000_000L
        while (!done && System.nanoTime() < deadline) {
            Thread.sleep(1)
        }
        runBlocking { launch { delay(1) } }
        assertEquals(true, done)
    }
}
`;

const LEDGER = `package demo.orders

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit

interface Balances {
    suspend fun fetch(): Int
}

private val fileGate = Semaphore(1)

class Ledger(private val balances: Balances, private val scope: CoroutineScope) {
    private val mutex = Mutex()
    private val single = Semaphore(1)
    private val pair = Semaphore(2)
    var total = 0

    suspend fun add() {
        total += balances.fetch()
    }

    suspend fun addAfterAwaiting() {
        val delta = balances.fetch()
        total += delta
    }

    suspend fun addFromSaved() {
        val current = total
        val delta = balances.fetch()
        total = current + delta
    }

    suspend fun addAccumulated() {
        var current = total
        current += balances.fetch()
        total = current
    }

    suspend fun addSavedBeforeLock() {
        val current = total
        mutex.withLock { total = current + 1 }
    }

    suspend fun addSerialized() {
        mutex.withLock { total += balances.fetch() }
    }

    suspend fun addSavedInsideLock() {
        mutex.withLock {
            val current = total
            val delta = balances.fetch()
            total = current + delta
        }
    }

    suspend fun addLaunched() {
        mutex.withLock { scope.launch { total += balances.fetch() } }
    }

    suspend fun addUnderLocalMutex() {
        val local = Mutex()
        local.withLock { total += balances.fetch() }
    }

    suspend fun addOneAtATime() {
        single.withPermit { total += balances.fetch() }
    }

    suspend fun addThroughFileGate() {
        fileGate.withPermit { total += balances.fetch() }
    }

    suspend fun addThroughCompanionGate() {
        shared.withPermit { total += balances.fetch() }
    }

    suspend fun addTwoAtATime() {
        pair.withPermit { total += balances.fetch() }
    }

    companion object {
        private val shared = Semaphore(1)
    }
}
`;

const SPRING_BOOT_TEST = `package org.springframework.boot.test.context

annotation class SpringBootTest(val webEnvironment: String = "MOCK")
`;

const AUTOWIRED = `package org.springframework.beans.factory.annotation

annotation class Autowired
`;

const CONTEXT_TEST = `package demo.orders

import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest
class UnusedContextTest {
    @Test
    fun runs() {
        assertEquals(2, scaled(1))
    }
}

@SpringBootTest
class UsedContextTest {
    @Autowired
    private lateinit var clock: Clock

    @Test
    fun runs() {
        clock = SlowClock()
        assertEquals(1L, clock.now())
    }
}
`;

export const REVIEW_RULE_FILES = {
  [`${MAIN}/Status.kt`]: STATUS,
  [`${MAIN}/Clock.kt`]: CLOCK,
  [`${MAIN}/Settlement.kt`]: SETTLEMENT,
  [`${MAIN}/Formatting.kt`]: FORMATTING,
  [`${MAIN}/Ledger.kt`]: LEDGER,
  [`${MAIN}/Inventory.kt`]: INVENTORY,
  [`${TEST}/WaitingTest.kt`]: WAITING_TEST,
  [`${TEST}/ContextTest.kt`]: CONTEXT_TEST,
  [`${SPRING}/boot/test/context/SpringBootTest.kt`]: SPRING_BOOT_TEST,
  [`${SPRING}/beans/factory/annotation/Autowired.kt`]: AUTOWIRED,
};

export const EXPECTED_REVIEW_FINDINGS = [
  'ClassLoadEffect Inventory.workers',
  'ClassLoadEffect Shelf.present',
  'ClassLoadEffect seeded',
  'ExhaustiveEnumPredicate isLive',
  'ExhaustiveEnumPredicate isOpen',
  'ExhaustiveEnumPredicate isSettled',
  'ExhaustiveEnumPredicate weight',
  'FixedSleepInTest WaitingTest.iterates',
  'FixedSleepInTest WaitingTest.sleeps',
  'FixedSleepInTest WaitingTest.sleeps',
  'NonAtomicUpdateAcrossSuspension Ledger.total in add',
  'NonAtomicUpdateAcrossSuspension Ledger.total in addAccumulated',
  'NonAtomicUpdateAcrossSuspension Ledger.total in addFromSaved',
  'NonAtomicUpdateAcrossSuspension Ledger.total in addLaunched',
  'NonAtomicUpdateAcrossSuspension Ledger.total in addSavedBeforeLock',
  'NonAtomicUpdateAcrossSuspension Ledger.total in addTwoAtATime',
  'NonAtomicUpdateAcrossSuspension Ledger.total in addUnderLocalMutex',
  'SingularAndPluralMember Query.tags',
  'SpringUnusedContext UnusedContextTest',
  'StaticForwardingWrapper absOf',
  'StaticForwardingWrapper total',
  'unused-option Envelope.retries',
  'unused-option Mailer.retries',
  'unused-option pad.width',
];

const EMPTY_JAR = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...Array.from({ length: 18 }, () => 0)]);

export function runtimeSerializationFiles(build) {
  return {
    'build.gradle.kts': `${build}
dependencies {
    runtimeOnly(files("libs/jackson-module-kotlin-2.17.2.jar"))
}
`,
    'libs/jackson-module-kotlin-2.17.2.jar': EMPTY_JAR,
  };
}
