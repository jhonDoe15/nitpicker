export const DEADLINES = `package demo.orders

import java.util.concurrent.Callable
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutorService
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.withTimeout

interface Lookup {
    fun get(key: String, fallback: String): String
}

fun giveUp(future: Future<String>): String =
    try {
        future.get(1, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
        "late"
    }

fun cancelOnTimeout(future: Future<String>): String =
    try {
        future.get(1, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
        future.cancel(true)
        "late"
    }

fun rethrowToTheOwner(future: Future<String>): String =
    try {
        future.get(1, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
        throw IllegalStateException(e)
    }

fun shutDownLetsItFinish(pool: ExecutorService, work: Callable<String>): String {
    val future = pool.submit(work)
    return try {
        future.get(1, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
        pool.shutdown()
        "late"
    }
}

fun shutDownNow(pool: ExecutorService, work: Callable<String>): String {
    val future = pool.submit(work)
    return try {
        future.get(1, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
        pool.shutdownNow()
        "late"
    }
}

fun cancelAsyncTask(work: () -> String): String {
    val future = CompletableFuture.supplyAsync { work() }
    return try {
        future.get(1, TimeUnit.SECONDS)
    } catch (e: TimeoutException) {
        future.cancel(true)
        "late"
    }
}

fun lookUp(cache: Lookup): String =
    try {
        cache.get("key", "fallback")
    } catch (e: TimeoutException) {
        "late"
    }

fun boundedAsync(work: () -> String): CompletableFuture<String> =
    CompletableFuture.supplyAsync { work() }.orTimeout(1, TimeUnit.SECONDS)

fun boundedGiven(given: CompletableFuture<String>): CompletableFuture<String> =
    given.orTimeout(1, TimeUnit.SECONDS)

suspend fun awaitOutside(scope: CoroutineScope): String {
    val work = scope.async { "done" }
    return withTimeout(1000) { work.await() }
}

suspend fun awaitAllOutside(scope: CoroutineScope): List<String> {
    val first = scope.async { "first" }
    val second = scope.async { "second" }
    return withTimeout(1000) { listOf(first, second).awaitAll() }
}

suspend fun cancelChildrenAfterTimeout(scope: CoroutineScope): String {
    val work = scope.async { "done" }
    try {
        return withTimeout(1000) { work.await() }
    } finally {
        scope.coroutineContext.cancelChildren()
    }
}

suspend fun cancelAfterTimeout(scope: CoroutineScope): String {
    val work = scope.async { "done" }
    try {
        return withTimeout(1000) { work.await() }
    } catch (e: TimeoutCancellationException) {
        work.cancel()
        throw e
    }
}

suspend fun startInside(): String = withTimeout(1000) { async { "done" }.await() }
`;
