package demo

import java.io.StringReader

fun rangeSum(n: Int): Int {
    var total = 0
    for (i in 0 until n) {
        total += i
    }
    for (i in 0..n) {
        total += i
    }
    for (i in n downTo 1 step 2) {
        total += i
    }
    return total
}

fun indexed(values: List<String>): String {
    val out = StringBuilder()
    for ((index, value) in values.withIndex()) {
        out.append(index).append(value)
    }
    for (i in values.indices) {
        out.append(i)
    }
    return out.toString()
}

fun inRange(x: Int): Boolean = x in 1..5

fun subjectless(x: Int): String =
    when {
        x < 0 -> "neg"
        x == 0 -> "zero"
        else -> "pos"
    }

fun whiles(n: Int): Int {
    var i = n
    var steps = 0
    while (i > 0) {
        i--
        steps++
    }
    do {
        steps++
    } while (steps < 3)
    return steps
}

fun smart(value: Any): Int =
    if (value is String) {
        value.length
    } else if (value !is Int) {
        -1
    } else {
        value
    }

fun lets(value: String?): Int = value?.let { it.length + 1 } ?: 0

fun applies(values: List<Int>): Int {
    var total = 0
    values.forEach { total += it }
    return total
}

fun finals(reader: StringReader): Int {
    try {
        return reader.read()
    } finally {
        reader.close()
    }
}

fun uses(reader: StringReader): Int = reader.use { it.read() }

val lazyValue: String by lazy { "lazy" }

class Holder(val items: List<Int> = emptyList(), val label: String? = null) {
    constructor(label: String) : this(emptyList(), label)

    init {
        require(items.size < 100) { "too many" }
    }

    override fun toString(): String = label ?: "none"

    fun check(): Int {
        check(items.isNotEmpty()) { "empty" }
        return items.first()
    }
}

interface Animal {
    fun sound(): String = "..."
}

class Dog : Animal {
    override fun sound(): String = "woof"
}

class Fish : Animal

fun sequences(): List<Int> = sequence {
    yield(1)
    yield(2)
}.toList()

fun failing(value: Int): Int {
    if (value > 100) {
        error("never in tests")
    }
    return value
}

fun unreachable(color: Color): Int =
    when (color) {
        Color.RED -> 1
        else -> throw IllegalStateException("unreachable")
    }
