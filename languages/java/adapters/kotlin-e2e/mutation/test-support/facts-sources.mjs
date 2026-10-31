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

fun narrow(value: Any?): String = value as String

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

fun narrowMany(values: List<Any?>): Int =
    (values
        .first() as String)
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

suspend fun <T> collect(block: suspend () -> T): T = block()

suspend fun viaCollect(id: Int): Int = collect { id * 3 }

suspend fun viaTry(id: Int): Int =
    try {
        coroutineScope { id + 1 }
    } catch (failure: IllegalStateException) {
        -1
    }

suspend fun viaIf(flag: Boolean): Int =
    if (flag) {
        coroutineScope { 1 }
    } else {
        0
    }

suspend fun discarded(id: Int) {
    coroutineScope { id }
    println(id)
}

class Sink {
    @JvmName("renamed")
    suspend fun original(out: StringBuilder) {
        delay(1)
        out.append("x")
    }

    val Int.tripled: Int
        inline get() = this * 3
}

@JvmInline
value class Percent(val share: Int) {
    constructor(text: String) : this(text.length * 2)
}

fun word(flag: Boolean): String =
    when (flag) {
        true -> "yes"
        false -> "no"
    }

fun mixed(flag: Boolean): Int =
    when (flag) {
        true -> 1
        false -> if (flag) 2 else 0
    }

fun statement(flag: Boolean) {
    when (flag) {
        true -> println("y")
        false -> println("n")
    }
}
`;
