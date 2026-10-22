const MAIN = 'src/main/kotlin/demo/lifetimes';

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
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

class Teardown(private val gateway: Gateway, private val gate: Mutex) {
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
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

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

export const COROUTINE_FILES = {
  [`${MAIN}/Gateway.kt`]: GATEWAY,
  [`${MAIN}/Teardown.kt`]: TEARDOWN,
  [`${MAIN}/Copier.kt`]: COPIER,
};

export const EXPECTED_COROUTINE_FINDINGS = [
  'ChildCoroutineOutlivesResource Copier.detached:reader:launch',
  'SuspendFunInFinallySection Teardown.cancelled:catch:delay',
  'SuspendFunInFinallySection Teardown.lingering:delay',
  'SuspendFunInFinallySection Teardown.locking:withLock',
  'SuspendFunInFinallySection Teardown.releasing:release',
];
