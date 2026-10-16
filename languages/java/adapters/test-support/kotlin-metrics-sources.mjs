export const UNITS = `package demo.units

fun plain(a: Int, b: Int): Int {
    if (a > 0 && b > 0 || a < -5) {
        return a
    }
    return b ?: 0
}

fun Int.double(): Int = this * 2

inline fun twice(block: () -> Unit) {
    block()
    block()
}

class Holder(private val start: Int) {
    constructor() : this(0) {
        println("default")
    }

    init {
        println("init")
    }

    val doubled: Int
        get() = start * 2

    val combine: (Int, Int, Int, Int) -> Int = { a, b, c, d ->
        if (a > b) c else d
    }

    val cached by lazy {
        val values = listOf(1, 2)
        values.sum()
    }

    val anonymous = fun(x: Int): Int {
        return x + 1
    }

    val eager = run {
        println("eager")
        1
    }

    abstract class Nested {
        abstract fun missing()
    }
}
`;

export const INITIALIZERS = `package demo.init

import kotlin.properties.Delegates

class Boot(private val seed: Int) {
    init {
    }

    init {
        println("one")
        check(seed > 0)
    }

    val plain = seed + 1

    val label = if (seed > 1) "big" else "small"

    val table = mapOf(1 to "a").map { (k, v) -> "$k$v" }

    val chosen = when (seed) {
        0 -> "zero"
        1 -> "one"
        else -> "many"
    }

    val observed by Delegates.observable(0) { _, old, new ->
        println("$old $new")
    }

    val handler = object : Runnable {
        override fun run() {
            println("run")
        }

        init {
            println("anonymous")
        }
    }

    companion object {
        val registry = HashMap<String, Int>().apply { put("a", 1) }

        init {
            registry["b"] = 2
        }
    }
}

object Single {
    init {
        println("single")
    }
}

val top = listOf(1, 2).map { it * 2 }

val simple = 3
`;

export const FLAT = 'package demo.flat\n\nfun flat() = 1\n';
export const BOM = '﻿package demo.bom\n\nfun bom() = 1\n';
export const ROOT_PACKAGE = 'fun root() = 1\n';
export const MULTIFILE_A =
  '@file:JvmName("Mf")\n@file:JvmMultifileClass\n\npackage demo.mf\n\nfun partA() = 1\n';
export const MULTIFILE_B =
  '@file:JvmName("Mf")\n@file:JvmMultifileClass\n\npackage demo.mf\n\nfun partB() = 2\n';
export const CRLF = 'package demo.crlf\r\n\r\nfun crlf(): Int {\r\n    return 1\r\n}\r\n';
export const BROKEN = 'package demo.broken\n\nclass Broken {\n    fun incomplete(: Int\n}\n';

export const NESTING = `package demo.nesting

fun chain(value: Int): String {
    if (value > 2) {
        return "big"
    } else if (value > 1) {
        return "mid"
    } else if (value > 0) {
        return "small"
    } else {
        return "none"
    }
}

fun inElseBlock(value: Int): String {
    if (value > 2) {
        return "big"
    } else {
        if (value > 1) {
            return "mid"
        }
        return "small"
    }
}

fun inBranch(value: Int): String {
    if (value > 2) {
        if (value > 3) {
            return "huge"
        } else if (value > 2) {
            return "big"
        }
    } else if (value > 1) {
        return "mid"
    }
    return "small"
}

fun withWhen(value: Int): String =
    if (value > 2) {
        "big"
    } else if (value > 1) {
        when (value) {
            2 -> "two"
            else -> "other"
        }
    } else {
        "small"
    }

fun inLoop(values: List<Int>): Int {
    var total = 0
    for (value in values) {
        if (value > 2) {
            total += 1
        } else if (value > 1) {
            total += 2
        } else {
            total += 3
        }
    }
    return total
}
`;
