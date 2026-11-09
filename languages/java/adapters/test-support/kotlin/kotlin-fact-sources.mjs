export const LOAD_EFFECTS = `package demo.load

import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager

val config: String = Files.readString(Path.of("app.conf"))
val counted = run { Files.size(Path.of("size.txt")) }
val lazyConfig by lazy { Files.readString(Path.of("lazy.conf")) }
val getterConfig: String get() = Files.readString(Path.of("getter.conf"))
val helped = connect()

private fun connect() = DriverManager.getConnection("jdbc:h2:mem:helped")

fun later() = DriverManager.getConnection("jdbc:h2:mem:later")

object Store {
    val task = Runnable { Files.delete(Path.of("task")) }

    init {
        Files.createFile(Path.of("store.lock"))
    }
}

class Repository {
    val local = DriverManager.getConnection("jdbc:h2:mem:repo")

    companion object {
        val shared = DriverManager.getConnection("jdbc:h2:mem:shared")
    }
}

class Registry private constructor() {
    val connection = DriverManager.getConnection("jdbc:h2:mem:registry")

    companion object {
        val instance = Registry()
    }
}

enum class Mode(val text: String) {
    FAST(Files.readString(Path.of("fast.txt"))),
}
`;

export const LOAD_SINGLETONS = `package demo.load

import java.io.File

class Getter {
    init { File("getter").exists() }
    companion object { val fresh: Getter get() = Getter() }
}

class Lazy {
    init { File("lazy").exists() }
    companion object { val instance by lazy { Lazy() } }
}

class Factory {
    init { File("factory").exists() }
    companion object { val make: () -> Factory = { Factory() } }
}

class Settings(private val values: Map<String, String>) {
    constructor(name: String) : this(parse(File(name).readLines()))

    companion object {
        val EMPTY = Settings(emptyMap())
        private fun parse(lines: List<String>) = lines.associateWith { it }
    }
}

class Pool private constructor(val size: Int) {
    constructor(name: String) : this(File(name).readText().length)

    companion object {
        val DEFAULT = Pool("pool.conf")
    }
}

class Made private constructor() {
    init { File("made").exists() }

    companion object {
        val INSTANCE = make()
        private fun make() = Made()
    }
}
`;

export const LOAD_HELPERS = `package demo.load

import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private fun readConfig(): String = File("cfg").readText()

object Config {
    val text = readConfig()
}

object Over {
    val size = read(3)
    fun read(n: Int) = n
    fun read(path: String) = File(path).readText()
}

object Named {
    val text = read(path = "named")
    fun read(n: Int = 1) = n
    fun read(path: String, retries: Int = 2) = File(path).readText().repeat(retries)
}

object Self {
    private val file = File("self")
    val text = this.file.readText()
}

val seen = listOf("a").map { File(it).exists() }
val deferred = sequenceOf("b").map { File(it).exists() }
val timer = kotlin.concurrent.fixedRateTimer(period = 1000L) { }
val zone = java.util.TimeZone.setDefault(null)
val pipeline = ProcessBuilder.startPipeline(listOf(ProcessBuilder("ls")))
val common = java.util.concurrent.ForkJoinPool.commonPool().submit { }
val scheduled = Executors.newScheduledThreadPool(1).schedule({ }, 1L, TimeUnit.SECONDS)
`;

export const LOAD_FINDINGS = [
  'Helpers.kt Config.readConfig() 7',
  'Helpers.kt Named.read() 22',
  'Helpers.kt Self.text 27',
  'Helpers.kt seen 30',
  'Helpers.kt timer 32',
  'Helpers.kt zone 33',
  'Helpers.kt pipeline 34',
  'Helpers.kt common 35',
  'Helpers.kt scheduled 36',
  'Helpers.kt scheduled 36',
  'Load.kt config 7',
  'Load.kt counted 8',
  'Load.kt connect() 13',
  'Load.kt Store.init 21',
  'Load.kt Repository.Companion.shared 29',
  'Load.kt Registry.connection 34',
  'Load.kt Mode.FAST 42',
  'Singletons.kt Pool.constructor 30',
  'Singletons.kt Made.init 38',
];

export const LIFETIMES = `package demo.lifetimes

import java.io.Closeable
import kotlinx.coroutines.*
import kotlinx.coroutines.NonCancellable as Shield
import kotlinx.coroutines.sync.Mutex

class Holder(private val scope: CoroutineScope, private val gate: Mutex) : CoroutineScope by scope {
    suspend fun cleanup(job: Job) {
        try {
            work()
        } finally {
            delay(1)
            job.join()
            gate.lock()
            withContext(Shield) { delay(2) }
            scope.launch { delay(3) }
            runCatching { yield() }
        }
    }

    suspend fun cancelled() {
        try {
            work()
        } catch (e: CancellationException) {
            delay(4)
        }
    }

    suspend fun timed() {
        try {
            withTimeout(1) { work() }
        } catch (e: CancellationException) {
            delay(5)
        }
    }

    suspend fun shielded() {
        withContext(NonCancellable) {
            try {
                work()
            } finally {
                delay(6)
            }
        }
    }

    private suspend fun shieldedRelease() = withContext(Shield) { delay(8) }

    suspend fun releases() {
        try {
            work()
        } finally {
            shieldedRelease()
        }
    }

    suspend fun uses(resource: Closeable, other: CoroutineScope) {
        resource.use { reader -> other.launch { reader.close() } }
        resource.use { launch { println(it) } }
        resource.use { reader -> other.launch { reader.close() }.join() }
        resource.use { reader -> runBlocking { launch { reader.close() } } }
        resource.use { reader -> val inner = CoroutineScope(Dispatchers.IO); inner.launch { reader.close() } }
        resource.use { reader -> other.launch { println("done") } }
        resource.use { reader -> val job = other.launch { reader.close() }; job.join() }
        resource.use { reader -> val job = other.launch { reader.close() }; if (reader.hashCode() > 0) { job.join() } }
    }

    private fun work() {}
}
`;

export const LIFETIME_FACTS = {
  cleanupCalls: [
    'finally cleanup delay',
    'finally cleanup join Job',
    'finally cleanup lock Mutex',
    'finally cleanup launch CoroutineScope',
    'finally cleanup runCatching',
    'finally cleanup yield',
    'catch cancelled delay',
    'finally releases shieldedRelease',
  ],
  shielded: ['shielded', 'shieldedRelease'],
  useLaunches: [
    'uses reader resource other CoroutineScope',
    'uses it resource class',
    'uses reader resource other CoroutineScope',
  ],
};

export function lifetimeFacts(file) {
  return {
    cleanupCalls: file.cleanupCalls.map(
      ({ section, function: name, name: callee, receiverType }) =>
        `${section} ${name} ${callee}${receiverType === undefined ? '' : ` ${receiverType}`}`,
    ),
    shielded: file.functions.filter(({ shielded }) => shielded).map(({ name }) => name),
    useLaunches: file.useLaunches.map(
      ({ function: name, resource, opened, scope, scopeType, implicit }) =>
        `${name} ${resource} ${opened} ${scope ?? implicit} ${scopeType ?? ''}`.trim(),
    ),
  };
}
