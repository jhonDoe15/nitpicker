import path from 'node:path';
import { SOURCE_RULE_IDS } from '../../../kotlin/rules/kotlin-rules.mjs';

const PACKAGE = 'package demo.guards\n\n';
const LOGGER = `${PACKAGE}import java.util.logging.Logger\n\n`;
const LEVELS = `${PACKAGE}import java.util.logging.Level\nimport java.util.logging.Logger\n\n`;
function parser(handling) {
  return `${LEVELS}class Parser(private val logger: Logger) {\n    fun parse(text: String): Result<Int> {\n        try {\n            return Result.success(text.toInt())\n        } catch (e: NumberFormatException) {\n            ${handling}\n            return Result.failure(e)\n        }\n    }\n}\n`;
}
const methods = Array.from(
  { length: 21 },
  (_, index) => `    fun m${String(index)}(): String = "m${String(index)}"`,
);

const HTTP = `${PACKAGE}import java.net.URI\nimport java.net.http.HttpClient\nimport java.net.http.HttpRequest\nimport java.net.http.HttpResponse\nimport java.time.Duration\nimport java.util.concurrent.CompletableFuture\n`;
const BODY = `    private fun body(url: URI): String {\n        val request = HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(5)).build()\n        return client.send(request, HttpResponse.BodyHandlers.ofString()).body()\n    }\n`;
function prefetch(task, extra = '') {
  return `${HTTP}${extra === '' ? '' : 'import java.util.concurrent.Semaphore\n'}\nclass Prefetch(private val client: HttpClient) {\n${extra === '' ? '' : '    private val permits = Semaphore(8)\n\n'}    fun pages(urls: List<URI>): List<CompletableFuture<String>> =\n        urls.map { url -> CompletableFuture.supplyAsync { ${task}(url) } }\n\n${extra}${BODY}}\n`;
}
const LIMITED = `    private fun limited(url: URI): String {\n        permits.acquire()\n        try {\n            return body(url)\n        } finally {\n            permits.release()\n        }\n    }\n\n`;

const QUERY = `${PACKAGE}class Query {\n    fun setParameter(name: String, value: Any): Query = this\n}\n\n`;
export const GUARD_ROOT = 'src/main/kotlin/demo/guards';
const GUARD_TEST_ROOT = 'src/test/kotlin/demo/guards';

const BANNED_GUARDS = {
  'State.kt': `${PACKAGE}var counter = 0\n`,
  'Audit.kt': `${LOGGER}class Audit(private val logger: Logger) {\n    fun record(user: String) {\n        logger.info("user $user")\n    }\n}\n`,
  'Shell.kt': `${PACKAGE}fun list(dir: String): Process = ProcessBuilder("sh", "-c", "ls " + dir).start()\n`,
  'Loader.kt': `${LOGGER}class Loader(private val logger: Logger) {\n    fun load(file: java.io.File): String? {\n        try {\n            return file.readText()\n        } catch (e: java.io.IOException) {\n            logger.warning("load failed")\n            return null\n        }\n    }\n}\n`,
  'Flags.kt': `${PACKAGE}fun render(text: String, bold: Boolean): String = if (bold) "<b>$text</b>" else text\n`,
  'TriState.kt': `${PACKAGE}fun toggle(force: Boolean?): Int = if (force == true) 1 else 0\n`,
  'Logic.kt': `${PACKAGE}fun differs(a: Int, b: Int): Boolean = !(a == b)\n`,
  'Mutation.kt': `${PACKAGE}fun append(items: MutableList<String>) {\n    items.add("x")\n}\n`,
  'Legacy.kt': `${PACKAGE}@Deprecated("Use current")\nfun legacy(): Int = 1\n\nfun current(): Int = 2\n`,
  'Spread.kt': `${PACKAGE}fun spread(low: Int, high: Int): Int = high - high + low\n`,
  'Parser.kt': parser('logger.log(Level.WARNING, "parse failed")'),
  'Formats.kt': `${LEVELS}class Formats(private val logger: Logger) {\n    fun loaded(count: Int) {\n        logger.log(Level.INFO, "loaded {0} of {1}", count)\n    }\n}\n`,
  'Secrets.kt': `${PACKAGE}val password = "hunter22x"\n`,
  'OrderHelper.kt': `${PACKAGE}class OrderHelper {\n    fun total(): Int = 1\n}\n`,
  'Commented.kt': `${PACKAGE}fun subtotal(): Int {\n    // val discount = compute(1)\n    return 1\n}\n`,
  'StringUtils.kt': `${PACKAGE}fun trimmed(text: String): String = text.trim()\n`,
  'Marked.kt': `${PACKAGE}annotation class Generated\n\n@Generated\nfun keep(): Int = 1\n`,
  'Casts.kt': `${PACKAGE}@Deprecated("Use next")\nfun old(): Int = 1\n\nfun next(): Int = old()\n\n@Suppress("unused")\nfun names(value: Any): List<String> = value as List<String>\n\nfun same(value: String): String = value as String\n`,
  'Wide.kt': `${PACKAGE}class Wide {\n${methods.join('\n')}\n}\n`,
  'Deep.kt': `${PACKAGE}open class Failure : Exception()\n\nopen class OrderFailure : Failure()\n\nopen class PaymentFailure : OrderFailure()\n\nclass CardFailure : PaymentFailure()\n`,
  'Literals.kt': `${PACKAGE}fun labels(): List<String> = listOf("shipping", "shipping", "shipping")\n`,
  'Stream.kt': `${PACKAGE}fun show(): Appendable = System.out.append("shown")\n`,
  'App.kt': `${PACKAGE}fun main() {\n    ProcessBuilder("serve", "--port", System.getenv("PORT")).inheritIO().start()\n}\n`,
  'Prefetch.kt': prefetch('body'),
  'Links.kt': `${PACKAGE}import java.net.URI\n\nfun cover(path: String): URI = URI.create("https://shop.example/$path")\n`,
  'Streams.kt': `${PACKAGE}import java.io.File\nimport java.util.jar.JarFile\n\nfun manifestOf(root: File): String = JarFile(root).name\n`,
  'Routes.kt': `${PACKAGE}fun route(name: String): Regex = Regex("^/$name/")\n\nfun clean(text: String): String = text.replace(Regex("abc"), "")\n`,
  'Exports.kt': `${PACKAGE}fun render(command: List<String>): Int = ProcessBuilder(command).start().waitFor()\n`,
  'Waits.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\n\nfun page(future: CompletableFuture<String>): String = future.join()\n`,
  'Versions.kt': `${PACKAGE}fun version(command: List<String>): String {\n    val process = ProcessBuilder(command).start()\n    return process.inputStream.bufferedReader().readText()\n}\n`,
  'Reports.kt': `${PACKAGE}const val RECENT = "select id from account where active limit 20"\n`,
  'Lookups.kt': `${QUERY}fun byIds(query: Query, ids: List<Long>): Query = query.setParameter("ids", ids)\n`,
  'Settings.kt': `${PACKAGE}fun batch(): String = System.getProperty("shop.batch", "50")\n`,
  'Replies.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\n\nfun interface Listener {\n    fun accept(value: String)\n}\n\nfun interface Channel {\n    fun onReply(listener: Listener)\n}\n\nfun reply(channel: Channel): CompletableFuture<String> {\n    val reply = CompletableFuture<String>()\n    channel.onReply { reply.complete(it) }\n    return reply\n}\n`,
  'Cleanup.kt': `${PACKAGE}class Cleanup(private val first: AutoCloseable, private val second: AutoCloseable) : AutoCloseable {\n    override fun close() {\n        first.close()\n        second.close()\n    }\n}\n`,
  'Pending.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\nimport java.util.concurrent.ConcurrentHashMap\n\nclass Pending : AutoCloseable {\n    private val waiting = ConcurrentHashMap<String, CompletableFuture<String>>()\n\n    fun add(id: String, reply: CompletableFuture<String>) {\n        waiting[id] = reply\n    }\n\n    override fun close() {\n        waiting.clear()\n    }\n}\n`,
  'Timers.kt': `${PACKAGE}import java.util.concurrent.Executors\n\nclass Timers : AutoCloseable {\n    private val scheduler = Executors.newSingleThreadScheduledExecutor()\n\n    fun start() {\n        scheduler.submit { }\n    }\n\n    override fun close() {\n        started = false\n    }\n\n    private var started = true\n}\n`,
  'Link.kt': `${PACKAGE}import kotlinx.coroutines.CoroutineScope\nimport kotlinx.coroutines.Deferred\nimport kotlinx.coroutines.async\n\nclass Link(private val scope: CoroutineScope) {\n    private var conn: Deferred<String>? = null\n\n    suspend fun get(): String {\n        if (conn == null) {\n            conn = scope.async { "link" }\n        }\n        return conn!!.await()\n    }\n}\n`,
  'Registry.kt': `${PACKAGE}import java.util.concurrent.ConcurrentHashMap\n\nannotation class Service\n\n@Service\nclass Registry {\n    private val sessions = ConcurrentHashMap<String, String>()\n\n    fun open(id: String, value: String) {\n        sessions[id] = value\n    }\n}\n`,
  'Paths.kt': `${PACKAGE}class Paths(private val known: List<String>) {\n    fun unique(paths: List<String>): List<String> {\n        val seen = mutableListOf<String>()\n        for (path in paths) {\n            if (path !in seen) seen.add(path)\n        }\n        return seen\n    }\n\n    fun matches(paths: List<String>): List<String?> = paths.map { p -> known.find { it.length == p.length } }\n\n    fun shortest(paths: List<String>): String = paths.sortedBy { it.length }.first()\n}\n`,
};

const BANNED_TESTS = {
  'EmptyTest.kt': `${PACKAGE}class EmptyTest {\n    fun setUp() = Unit\n}\n`,
  'StaleTest.kt': `${PACKAGE}import kotlin.test.Test\nimport kotlin.test.assertEquals\n\nclass StaleTest {\n    @Test\n    fun totals() {\n        // val before = subtotal()\n        assertEquals(1, subtotal())\n    }\n}\n`,
};

const ALLOWED_GUARDS = {
  'State.kt': `${PACKAGE}val names = listOf("a")\n`,
  'Audit.kt': `${LOGGER}class Audit(private val logger: Logger) {\n    fun record(user: String) {\n        logger.info { "user $user" }\n    }\n}\n`,
  'Shell.kt': `${PACKAGE}fun list(dir: String): Process = ProcessBuilder("ls", dir).start()\n`,
  'Loader.kt': `${PACKAGE}class Loader {\n    fun load(file: java.io.File): String {\n        try {\n            return file.readText()\n        } catch (e: java.io.IOException) {\n            throw IllegalStateException("load failed", e)\n        }\n    }\n}\n`,
  'Flags.kt': `${PACKAGE}fun plain(text: String): String = text\n\nfun bold(text: String): String = "<b>$text</b>"\n`,
  'TriState.kt': `${PACKAGE}fun describe(force: Boolean): String = "forced=$force"\n`,
  'Logic.kt': `${PACKAGE}fun differs(a: Int, b: Int): Boolean = a != b\n`,
  'Mutation.kt': `${PACKAGE}fun append(items: List<String>): List<String> = items + "x"\n`,
  'Legacy.kt': `${PACKAGE}fun current(): Int = 2\n`,
  'Spread.kt': `${PACKAGE}fun spread(low: Int, high: Int): Int = high - low\n`,
  'Parser.kt': parser('logger.log(Level.WARNING, "parse failed", e)'),
  'Formats.kt': `${LEVELS}class Formats(private val logger: Logger) {\n    fun loaded(count: Int, total: Int) {\n        logger.log(Level.INFO, "loaded {0} of {1}", arrayOf(count, total))\n    }\n}\n`,
  'Secrets.kt': `${PACKAGE}data class Credentials(val password: String)\n`,
  'PriceRounder.kt': `${PACKAGE}class PriceRounder {\n    fun round(cents: Int): Int = cents\n}\n`,
  'Stream.kt': `${PACKAGE}fun show(out: Appendable): Appendable = out.append("shown")\n`,
  'Commented.kt': `${PACKAGE}// Totals are in cents, so rounding stays exact.\nfun subtotal(): Int = 1\n`,
  'StringTrimming.kt': `${PACKAGE}fun trimmed(text: String): String = text.trim()\n`,
  'Marked.kt': `${PACKAGE}fun keep(): Int = 1\n`,
  'Casts.kt': `${PACKAGE}fun next(): Int = 1\n\nfun names(value: Any): List<String> = (value as? List<*>).orEmpty().filterIsInstance<String>()\n\nfun same(value: String): String = value\n`,
  'Literals.kt': `${PACKAGE}private const val SHIPPING = "shipping"\n\nfun labels(): List<String> = listOf(SHIPPING, SHIPPING, SHIPPING)\n\nfun kind(text: String): Int = when (text) {\n    "shipping-pending" -> 1\n    "shipping-sent", "shipping-pending" -> 2\n    else -> 3\n}\n\nfun more(): Map<String, Int> = mapOf("shipping-pending" to 1)\n`,
  'App.kt': `${PACKAGE}fun main() {\n    val batch = System.getProperty("shop.batch", "50")\n    ProcessBuilder("serve", "--port", System.getenv("PORT"), "--batch", batch).inheritIO().start()\n    show(System.out)\n}\n`,
  'Prefetch.kt': prefetch('limited', LIMITED),
  'Links.kt': `${PACKAGE}import java.net.URI\n\nfun cover(path: String): URI? = runCatching { URI.create("https://shop.example/$path") }.getOrNull()\n`,
  'Streams.kt': `${PACKAGE}import java.io.File\nimport java.util.jar.JarFile\n\nfun manifestOf(root: File): String = JarFile(root).use { it.name }\n`,
  'Routes.kt': `${PACKAGE}fun route(name: String): Regex = Regex("^/\${Regex.escape(name)}/")\n\nfun clean(text: String): String = text.replace("abc", "")\n`,
  'Waits.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\nimport java.util.concurrent.TimeUnit\n\nprivate const val PAGE_SECONDS = 30L\n\nfun page(future: CompletableFuture<String>): String = future.get(PAGE_SECONDS, TimeUnit.SECONDS)\n`,
  'Exports.kt': `${PACKAGE}import java.util.concurrent.TimeUnit\n\nprivate const val DEADLINE_SECONDS = 30L\n\nfun render(command: List<String>): Int {\n    val process = ProcessBuilder(command).start()\n    check(process.waitFor(DEADLINE_SECONDS, TimeUnit.SECONDS)) { "timed out: $command" }\n    return process.exitValue()\n}\n`,
  'Versions.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\nimport java.util.concurrent.TimeUnit\n\nprivate const val VERSION_SECONDS = 30L\n\nfun version(command: List<String>): String {\n    val process = ProcessBuilder(command).start()\n    val output = CompletableFuture.supplyAsync { process.inputStream.bufferedReader().readText() }\n    check(process.waitFor(VERSION_SECONDS, TimeUnit.SECONDS)) { "timed out: $command" }\n    return output.get(VERSION_SECONDS, TimeUnit.SECONDS)\n}\n`,
  'Reports.kt': `${PACKAGE}const val RECENT = "select id from account where active order by id limit 20"\n`,
  'Lookups.kt': `${QUERY}fun byIds(query: Query, ids: List<Long>): Query {\n    if (ids.isEmpty()) {\n        return query\n    }\n    return query.setParameter("ids", ids)\n}\n`,
  'Replies.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\n\nfun interface Listener {\n    fun accept(value: String)\n}\n\nfun interface Failures {\n    fun accept(error: Throwable)\n}\n\ninterface Channel {\n    fun onReply(listener: Listener)\n\n    fun onFailure(listener: Failures)\n}\n\nfun reply(channel: Channel): CompletableFuture<String> {\n    val reply = CompletableFuture<String>()\n    channel.onReply { reply.complete(it) }\n    channel.onFailure { reply.completeExceptionally(it) }\n    return reply\n}\n`,
  'Cleanup.kt': `${PACKAGE}class Cleanup(private val first: AutoCloseable, private val second: AutoCloseable) : AutoCloseable {\n    override fun close() {\n        first.use { second.close() }\n    }\n}\n`,
  'Pending.kt': `${PACKAGE}import java.util.concurrent.CompletableFuture\nimport java.util.concurrent.ConcurrentHashMap\n\nclass Pending : AutoCloseable {\n    private val waiting = ConcurrentHashMap<String, CompletableFuture<String>>()\n\n    fun add(id: String, reply: CompletableFuture<String>) {\n        waiting[id] = reply\n    }\n\n    override fun close() {\n        waiting.values.forEach { it.completeExceptionally(IllegalStateException("closed")) }\n        waiting.clear()\n    }\n}\n`,
  'Timers.kt': `${PACKAGE}import java.util.concurrent.Executors\n\nclass Timers : AutoCloseable {\n    private val scheduler = Executors.newSingleThreadScheduledExecutor()\n\n    fun start() {\n        scheduler.submit { }\n    }\n\n    override fun close() {\n        scheduler.shutdownNow()\n    }\n\n    private var started = true\n}\n`,
  'Link.kt': `${PACKAGE}import kotlinx.coroutines.CoroutineScope\nimport kotlinx.coroutines.Deferred\nimport kotlinx.coroutines.async\n\nclass Link(private val scope: CoroutineScope) {\n    private var conn: Deferred<String>? = null\n\n    suspend fun get(): String {\n        if (conn == null) {\n            val attempt = scope.async { "link" }\n            conn = attempt\n            attempt.invokeOnCompletion { if (it != null && conn === attempt) conn = null }\n        }\n        return conn!!.await()\n    }\n}\n`,
  'Registry.kt': `${PACKAGE}import java.util.concurrent.ConcurrentHashMap\n\nannotation class Service\n\n@Service\nclass Registry {\n    private val sessions = ConcurrentHashMap<String, String>()\n\n    fun open(id: String, value: String) {\n        sessions[id] = value\n    }\n\n    fun end(id: String) {\n        sessions.remove(id)\n    }\n}\n`,
  'Paths.kt': `${PACKAGE}class Paths(private val known: List<String>) {\n    fun unique(paths: List<String>): Set<String> {\n        val seen = mutableSetOf<String>()\n        for (path in paths) {\n            seen.add(path)\n        }\n        return seen\n    }\n\n    fun matches(paths: List<String>): List<String?> {\n        val byLength = known.associateBy { it.length }\n        return paths.map { p -> byLength[p.length] }\n    }\n\n    fun shortest(paths: List<String>): String? = paths.minByOrNull { it.length }\n}\n`,
};

const ALLOWED_TESTS = {
  'OrderTest.kt': `${PACKAGE}import kotlin.test.Test\nimport kotlin.test.assertEquals\n\nclass OrderTest {\n    @Test\n    fun totals() {\n        assertEquals(1, subtotal())\n        assertEquals("shipping", "shipping")\n        assertEquals("shipping", "shipping")\n    }\n}\n`,
};

function guardFiles(sources, tests) {
  return {
    ...Object.fromEntries(
      Object.entries(sources).map(([name, text]) => [`${GUARD_ROOT}/${name}`, text]),
    ),
    ...Object.fromEntries(
      Object.entries(tests).map(([name, text]) => [`${GUARD_TEST_ROOT}/${name}`, text]),
    ),
  };
}

export const BANNED_FILES = guardFiles(BANNED_GUARDS, BANNED_TESTS);
export const ALLOWED_FILES = guardFiles(ALLOWED_GUARDS, ALLOWED_TESTS);

export const EXPECTED_BANNED = [
  'kotlin-source/MutableModuleState State.kt',
  'kotlin-source/LogStringConcatenation Audit.kt',
  'kotlin-source/ShellCommand Shell.kt',
  'kotlin-source/StandardStreamOutsideEntryPoint Stream.kt',
  'kotlin-source/CatchOnlyLogsOrReturnsDefault Loader.kt',
  'detekt/catch-log-without-exception Parser.kt',
  'kotlin-source/LogFormatArguments Formats.kt',
  'kotlin-source/BooleanFlagParameter Flags.kt',
  'kotlin-source/TriStateBoolean TriState.kt',
  'kotlin-source/SimplerBooleanLogic Logic.kt',
  'kotlin-source/ParameterMutation Mutation.kt',
  'kotlin-source/CompatibilityShim Legacy.kt',
  'kotlin-source/OperandSlip Spread.kt',
  'kotlin-source/CompatibilityShim Casts.kt',
  'kotlin-source/HardcodedSecret Secrets.kt',
  'kotlin-source/GenericTypeName OrderHelper.kt',
  'kotlin-source/CommentedOutCode Commented.kt',
  'kotlin-source/GenericFileName StringUtils.kt',
  'kotlin-source/CommentedOutCode StaleTest.kt',
  'kotlin-source/RepeatedStringLiteral Literals.kt',
  'kotlin-source/GeneratedOnHandWrittenCode Marked.kt',
  'kotlin-source/TestClassWithoutTestCases EmptyTest.kt',
  'kotlin-source/UnboundedFanOut Prefetch.kt',
  'kotlin-source/UriCreateDynamic Links.kt',
  'kotlin-source/UnclosedInlineResource Streams.kt',
  'kotlin-source/UnquotedRegexValue Routes.kt',
  'kotlin-source/PlainTextRegex Routes.kt',
  'kotlin-source/ProcessWaitWithoutTimeout Exports.kt',
  'kotlin-source/ProcessWaitWithoutTimeout Versions.kt',
  'kotlin-source/UnboundedWait Waits.kt',
  'kotlin-source/UnorderedQuery Reports.kt',
  'kotlin-source/UnboundedQueryArray Lookups.kt',
  'kotlin-source/ConfigurationReadOutsideCompositionRoot Settings.kt',
  'kotlin-source/FutureWithoutException Replies.kt',
  'kotlin-source/CleanupSkippedOnFailure Cleanup.kt',
  'kotlin-source/PendingFuturesNotFailedOnClose Pending.kt',
  'kotlin-source/TimerNotStoppedOnClose Timers.kt',
  'kotlin-source/CachedDeferredKeepsFailure Link.kt',
  'kotlin-source/UnboundedCollectionProperty Registry.kt',
  'kotlin-source/ListUsedAsSet Paths.kt',
  'kotlin-source/LinearLookupInLoop Paths.kt',
  'kotlin-source/SortForExtreme Paths.kt',
  'kotlinc/deprecation Casts.kt',
  'kotlinc/unchecked Casts.kt',
  'kotlinc/cast Casts.kt',
  'structure/class-methods-limit Wide.kt',
  'structure/inheritance-depth-limit Deep.kt',
].toSorted();

const GUARD_TOOLS = new Set(['kotlin-source', 'kotlinc']);
const CLASS_RULES = new Set([
  'class-methods-limit',
  'class-fields-limit',
  'inheritance-depth-limit',
]);

const DETEKT_SOURCE_RULES = new Set(SOURCE_RULE_IDS);

export function guardFindings(findings) {
  return findings.filter(
    ({ tool, rule }) =>
      GUARD_TOOLS.has(tool) ||
      (tool === 'structure' && CLASS_RULES.has(rule)) ||
      (tool === 'detekt' && DETEKT_SOURCE_RULES.has(rule)),
  );
}

export function printedRule({ tool, rule }) {
  return tool === 'structure' || tool === 'detekt' ? rule : `${tool}/${rule}`;
}

export function summary(findings) {
  return guardFindings(findings)
    .map(({ tool, rule, path: file }) => `${tool}/${rule} ${path.basename(file)}`)
    .toSorted();
}
