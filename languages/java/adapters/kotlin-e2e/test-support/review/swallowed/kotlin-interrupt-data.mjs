const MAIN = 'src/main/kotlin/demo/orders';

const INTERRUPTS = `package demo.orders

import java.util.logging.Logger

private val log = Logger.getLogger("pauses")

fun pauseQuietly() {
    try {
        Thread.sleep(1)
    } catch (error: InterruptedException) {
        log.warning("interrupted")
    }
}

fun pauseOtherThread(worker: Thread) {
    try {
        Thread.sleep(1)
    } catch (error: InterruptedException) {
        worker.interrupt()
    }
}

fun pauseWithLazyRestore(): Int =
    try {
        Thread.sleep(1)
        1
    } catch (error: InterruptedException) {
        val restore = { Thread.currentThread().interrupt() }
        restore.hashCode()
    }

fun pauseInLoop(times: Int) {
    try {
        Thread.sleep(1)
    } catch (error: InterruptedException) {
        for (index in 0 until times) {
            Thread.currentThread().interrupt()
        }
    }
}

fun pauseEach(items: List<String>): Int {
    var count = 0
    outer@ for (item in items) {
        try {
            Thread.sleep(1)
        } catch (error: InterruptedException) {
            break@outer
        }
        count += item.length
    }
    return count
}

class Ticker {
    val delayMillis: Long =
        try {
            Thread.sleep(1)
            1L
        } catch (error: InterruptedException) {
            0L
        }
}

fun pauseAndRestore() {
    try {
        Thread.sleep(1)
    } catch (error: InterruptedException) {
        Thread.currentThread().interrupt()
    }
}

fun pauseAndFail() {
    try {
        Thread.sleep(1)
    } catch (error: InterruptedException) {
        throw IllegalStateException("interrupted", error)
    }
}

fun pauseAndReport() {
    try {
        Thread.sleep(1)
    } catch (error: InterruptedException) {
        try {
            println("interrupted")
        } finally {
            Thread.currentThread().interrupt()
        }
    }
}

fun pauseOrFallBack(): Int =
    try {
        Thread.sleep(1)
        1
    } catch (error: InterruptedException) {
        throw IllegalStateException(error)
    } catch (error: IllegalStateException) {
        println("fell back")
        -1
    }

class Pacer : Thread() {
    override fun run() {
        try {
            sleep(1)
        } catch (error: InterruptedException) {
            interrupt()
        }
    }
}
`;

export const INTERRUPT_FILES = {
  [`${MAIN}/Interrupts.kt`]: INTERRUPTS,
};

export const SWALLOWED_INTERRUPTS = [
  'SwallowedInterrupt Ticker.delayMillis',
  'SwallowedInterrupt pauseEach',
  'SwallowedInterrupt pauseInLoop',
  'SwallowedInterrupt pauseOtherThread',
  'SwallowedInterrupt pauseQuietly',
  'SwallowedInterrupt pauseWithLazyRestore',
];
