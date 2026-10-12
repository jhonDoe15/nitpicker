package demo

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.coroutines.CoroutineContext
import kotlin.properties.Delegates

fun numbers(): Flow<Int> =
    flow {
        emit(1)
        delay(1)
        emit(2)
    }

suspend fun collected(): List<Int> = numbers().toList()

suspend fun safeFetch(id: Int): String =
    try {
        delay(1)
        if (id < 0) throw IllegalArgumentException("neg")
        "ok$id"
    } catch (e: IllegalArgumentException) {
        "bad"
    }

suspend fun parallel(context: CoroutineContext): Int =
    withContext(context) {
        coroutineScope {
            val a = async { delay(1); 1 }
            val b = async { delay(1); 2 }
            launch { delay(1) }
            a.await() + b.await()
        }
    }

fun grade(score: Int): String =
    when (score) {
        in 90..100 -> "A"
        in 80..89 -> "B"
        else -> "C"
    }

@JvmInline
value class Meters(val value: Double) {
    fun doubled(): Meters = Meters(value * 2)
}

object Registry {
    var size: Int by Delegates.observable(0) { _, _, new -> last = new }
    var last = 0

    @JvmStatic
    fun reset() {
        size = 0
    }
}

val String.shout: String get() = uppercase() + "!"

fun String?.orDash(): String = if (isNullOrEmpty()) "-" else this

fun pairs(values: Map<String, Int>): List<String> =
    values.entries.mapNotNull { (key, count) -> if (count > 0) key else null }

fun built(items: List<String>): String =
    buildString {
        for (item in items) {
            append(item)
        }
    }
