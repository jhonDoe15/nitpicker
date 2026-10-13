package demo

import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking

fun trailingAnd(a: Boolean, b: Boolean): Int {
    if (a &&
        b
    ) {
        return 1
    }
    return 0
}

fun trailingOr(a: Boolean, b: Boolean): Int {
    if (a ||
        b
    ) {
        return 1
    }
    return 0
}

fun bangLabel(): List<String> = runBlocking {
    flow {
        emit("Hello!")
    }.toList()
}

fun lambdaArrow(): List<Int> = runBlocking {
    flow {
        emit(listOf(1).map { n -> n + 1 }.first())
    }.toList()
}

fun forEmit(): List<Int> = runBlocking {
    flow {
        for (n in 1..2) emit(n)
    }.toList()
}

fun plainEmit(): List<Int> = runBlocking {
    flow {
        emit(1)
    }.toList()
}
