package demo

fun lookup(key: String): Int? = if (key == "a") 1 else null

fun elvisNext(key: String): Int {
    val found = lookup(key)
        ?: -1
    return found
}

fun multiCond(flag: Boolean): Int {
    if (
        flag
    ) {
        return 1
    }
    return 2
}

fun andNext(a: Boolean, b: Boolean): Int {
    val ok = a
        && b
    return if (ok) 1 else 0
}

fun safeNext(s: String?): Int {
    val n = s
        ?.length
    return n.hashCode()
}

fun isEven(n: Int): Boolean = n % 2 == 0

fun refs(n: Int): Int {
    val kept = n.takeIf(::isEven)
    return kept.hashCode()
}

fun refAny(xs: List<Int>): Boolean = xs.any(::isEven)

fun fallback(s: String): String = s.ifEmpty { "none" }

fun whenPrev(n: Int): String =
    when (
        n
    ) {
        1 -> "one"
        2 -> "two"
        else -> "many"
    }

fun nonEmptyNext(s: String): Int {
    if (s
            .isNotEmpty()
    ) return 1
    return 0
}

fun untestedMulti(s: String?, flag: Boolean): Int {
    val v = s
        ?: return 0
    if (
        flag
    ) {
        return v.length
    }
    return -v.length
}

fun untestedPlain(x: Int): Int = if (x > 0) 1 else 2

fun untestedLet(s: String?): Int = s?.let { it.length } ?: 0
