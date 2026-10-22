export const FACTS_SOURCE = `package demo

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class Point(val x: Int, val y: Int = 0)

class Account(val id: String, var balance: Int) {
    val label: String
        get() = "account $id"

    val tags by lazy { listOf(id) }

    init {
        require(balance >= 0)
    }

    fun deposit(amount: Int) = if (amount > 0) balance + amount else balance
}

interface Animal {
    fun sound(): String = "..."
}

class Fish : Animal

@JvmInline
value class Meters(val value: Double)

inline fun twice(action: () -> Int): Int = action() + action()

suspend fun fetch(id: Int): Int {
    delay(1)
    return coroutineScope {
        val total = async { id * 2 }
        launch { delay(1) }
        total.await()
    }
}

fun force(text: String?): Int = text!!.length

val names = listOf("a", "b").map { it.uppercase() }

class Registry {
    companion object {
        @JvmStatic
        fun create(name: String?): Registry =
            if (name != null &&
                name.isNotEmpty()) Registry() else Registry()
    }
}

inline fun <T> measured(block: () -> T): T = block()

fun runMeasured(value: String?): Int =
    measured {
        value
            ?.length
            ?: 0
    }

fun strict(value: String?): Int =
    listOf(value)
        .firstOrNull()!!
        .length

fun repeatAction(times: Int, action: () -> Unit) {
    for (index in 0 until times) action()
}

suspend fun report(id: Int) {
    delay(1)
    repeatAction(id) { println(id) }
    println(id)
}

suspend fun combine(id: Int): Int = coroutineScope {
    val first = async {
        if (id > 0) return@async 1
        2
    }
    first.await()
}
`;
