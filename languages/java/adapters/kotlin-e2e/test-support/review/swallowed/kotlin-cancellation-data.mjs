const MAIN = 'src/main/kotlin/demo/orders';
const TEST = 'src/test/kotlin/demo/orders';

const CANCELLATIONS = `package demo.orders

import java.util.concurrent.CancellationException
import java.util.concurrent.Future
import kotlinx.coroutines.CancellationException as Cancelled
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

suspend fun pollQuietly(): Int {
    try {
        delay(1)
    } catch (error: CancellationException) {
        println("polling stopped")
    }
    return 1
}

suspend fun pollRenamed(): Int =
    try {
        delay(1)
        1
    } catch (error: Cancelled) {
        -1
    }

suspend fun pollAndDescribe(errors: MutableList<String>): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        errors.add("stopped: \${error.message}")
        -1
    }

suspend fun pollWithLazyThrow(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        val rethrow = { throw error }
        rethrow.hashCode()
    }

suspend fun pollAfterMessageCheck(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        if (error.message == "stop") {
            throw error
        }
        -1
    }

suspend fun pollInRepeat(times: Int): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        repeat(times) { throw error }
        -1
    }

suspend fun pollWhenWithoutElse(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        when (error) {
            is TimeoutCancellationException -> println("timed out")
        }
        -1
    }

fun CoroutineScope.launchQuietly() {
    launch {
        try {
            delay(1)
        } catch (error: CancellationException) {
            println("stopped")
        }
    }
}

suspend fun pollAndRethrow(): Int {
    try {
        delay(1)
    } catch (error: CancellationException) {
        throw error
    }
    return 1
}

suspend fun pollAndCheck(): Int {
    try {
        delay(1)
    } catch (error: CancellationException) {
        currentCoroutineContext().ensureActive()
    }
    return 1
}

suspend fun pollTimeout(): Int? =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        if (error is TimeoutCancellationException) null else throw error
    }

suspend fun pollTimeoutWhen(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        when (error) {
            is TimeoutCancellationException -> -1
            else -> throw error
        }
    }

suspend fun pollWhileActive(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        if (!currentCoroutineContext().isActive) {
            throw error
        }
        -1
    }

suspend fun pollAndHandOff(result: CompletableDeferred<Int>) {
    try {
        delay(1)
        result.complete(1)
    } catch (error: CancellationException) {
        result.completeExceptionally(error)
    }
}

suspend fun pollAsResult(): Result<Int> =
    try {
        delay(1)
        Result.success(1)
    } catch (error: CancellationException) {
        Result.failure(error)
    }

suspend fun pollAndCleanUp(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        withContext(NonCancellable) { println("cleaning up") }
        throw error
    }

suspend fun pollAndRethrowLater(): Int =
    try {
        delay(1)
        1
    } catch (error: CancellationException) {
        withContext(NonCancellable) {
            println("cleaning up")
            throw error
        }
    }

suspend fun pollOrStop(): Int =
    try {
        delay(1)
        1
    } catch (cause: CancellationException) {
        error("stopped: \${cause.message}")
    }

fun readCancelled(future: Future<Int>): Int? =
    try {
        future.get()
    } catch (error: CancellationException) {
        null
    }
`;

const PACING_TEST = `package demo.orders

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail
import kotlinx.coroutines.runBlocking

class HandlersTest {
    private suspend fun pause(): Int {
        Thread.sleep(1)
        return 1
    }

    @Test
    fun paces() {
        assertEquals(1, runBlocking { pause() })
    }

    @Test
    fun waitsOrFails() {
        try {
            java.util.concurrent.CountDownLatch(0).await()
        } catch (error: InterruptedException) {
            fail("interrupted")
        }
        assertEquals(1, 1)
    }
}
`;

export const CANCELLATION_FILES = {
  [`${MAIN}/Cancellations.kt`]: CANCELLATIONS,
  [`${TEST}/HandlersTest.kt`]: PACING_TEST,
};

export const SWALLOWED_CANCELLATIONS = [
  'SwallowedCancellation launchQuietly',
  'SwallowedCancellation pollAfterMessageCheck',
  'SwallowedCancellation pollAndDescribe',
  'SwallowedCancellation pollInRepeat',
  'SwallowedCancellation pollQuietly',
  'SwallowedCancellation pollRenamed',
  'SwallowedCancellation pollWhenWithoutElse',
  'SwallowedCancellation pollWithLazyThrow',
];
