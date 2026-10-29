const MAIN = 'src/main/kotlin/demo/lifetimes';
const TEST = 'src/test/kotlin/demo/lifetimes';

const GATEWAY = `package demo.lifetimes

interface Gateway {
    suspend fun release()

    fun closeNow()
}
`;

const TEARDOWN = `package demo.lifetimes

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

class Teardown(
    private val gateway: Gateway,
    private val gate: Mutex,
    private val permits: Semaphore,
) {
    private suspend fun shieldedRelease() = withContext(NonCancellable) { gateway.release() }

    private suspend fun partlyShielded() {
        delay(1)
        withContext(NonCancellable) { gateway.release() }
    }

    suspend fun releasingShielded() {
        try {
            gateway.closeNow()
        } finally {
            shieldedRelease()
        }
    }

    suspend fun releasingPartlyShielded() {
        try {
            gateway.closeNow()
        } finally {
            partlyShielded()
        }
    }

    suspend fun permitted() {
        try {
            gateway.closeNow()
        } finally {
            permits.withPermit { gateway.closeNow() }
        }
    }

    suspend fun lingering() {
        try {
            gateway.closeNow()
        } finally {
            delay(10)
        }
    }

    suspend fun locking() {
        try {
            gateway.closeNow()
        } finally {
            gate.withLock { gateway.closeNow() }
        }
    }

    suspend fun releasing() {
        try {
            gateway.closeNow()
        } finally {
            gateway.release()
        }
    }

    suspend fun cancelled() {
        try {
            gateway.closeNow()
        } catch (cancelled: CancellationException) {
            delay(1)
            throw cancelled
        }
    }

    suspend fun shielded() {
        try {
            gateway.closeNow()
        } finally {
            withContext(NonCancellable) {
                withTimeout(5_000) { gateway.release() }
            }
        }
    }

    suspend fun blocking() {
        try {
            gateway.closeNow()
        } finally {
            gateway.closeNow()
        }
    }

    suspend fun shieldedInside() {
        withContext(NonCancellable) {
            try {
                gateway.closeNow()
            } finally {
                gateway.release()
            }
        }
    }
}
`;

const COPIER = `package demo.lifetimes

import java.io.Closeable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.launch as start

class Copier(private val scope: CoroutineScope) {
    fun detached(source: Closeable) {
        source.use { reader ->
            scope.launch { reader.close() }
        }
    }

    suspend fun joined(source: Closeable) {
        source.use { reader ->
            scope.launch { reader.close() }.join()
        }
    }

    suspend fun joinedLater(source: Closeable) {
        source.use { reader ->
            val job = scope.launch { reader.close() }
            job.join()
        }
    }

    suspend fun joinedTogether(source: Closeable) {
        source.use { reader ->
            val first = scope.launch { reader.close() }
            val second = scope.launch { reader.close() }
            joinAll(first, second)
        }
    }

    suspend fun joinedOther(source: Closeable, other: Job) {
        source.use { reader ->
            scope.launch { reader.close() }
            other.join()
        }
    }

    suspend fun joinedSometimes(source: Closeable, wait: Boolean) {
        source.use { reader ->
            val job = scope.launch { reader.close() }
            if (wait) {
                job.join()
            }
        }
    }

    fun renamed(source: Closeable) {
        source.use { stream ->
            scope.start { stream.close() }
        }
    }

    fun everywhere(source: Closeable) {
        source.use { reader ->
            GlobalScope.launch { reader.close() }
        }
    }

    suspend fun nested(source: Closeable) {
        source.use { reader ->
            coroutineScope {
                launch { reader.close() }
            }
        }
    }

    fun owned(source: Closeable) {
        scope.launch {
            source.use { reader -> reader.close() }
        }
    }

    fun unrelated(source: Closeable) {
        source.use { reader ->
            scope.launch { println("done") }
            reader.close()
        }
    }
}
`;

const COPIER_TEST = `package demo.lifetimes

import java.io.Closeable
import kotlin.test.Test
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class CopierTest {
    private val scope = CoroutineScope(Dispatchers.Default)

    private val input = Closeable { }

    @Test
    fun detached() {
        input.use { reader ->
            scope.launch { reader.close() }
        }
    }
}
`;

export const COROUTINE_FILES = {
  [`${MAIN}/Gateway.kt`]: GATEWAY,
  [`${MAIN}/Teardown.kt`]: TEARDOWN,
  [`${MAIN}/Copier.kt`]: COPIER,
  [`${TEST}/CopierTest.kt`]: COPIER_TEST,
};

export const EXPECTED_COROUTINE_FINDINGS = [
  'ChildCoroutineOutlivesResource Copier.detached:source:launch',
  'ChildCoroutineOutlivesResource Copier.joinedOther:source:launch',
  'ChildCoroutineOutlivesResource Copier.joinedSometimes:source:launch',
  'ChildCoroutineOutlivesResource Copier.renamed:source:launch',
  'ChildCoroutineOutlivesResource CopierTest.detached:input:launch',
  'SuspendFunInFinallySection Teardown.cancelled:catch:delay',
  'SuspendFunInFinallySection Teardown.lingering:delay',
  'SuspendFunInFinallySection Teardown.locking:withLock',
  'SuspendFunInFinallySection Teardown.permitted:withPermit',
  'SuspendFunInFinallySection Teardown.releasing:release',
  'SuspendFunInFinallySection Teardown.releasingPartlyShielded:partlyShielded',
];
