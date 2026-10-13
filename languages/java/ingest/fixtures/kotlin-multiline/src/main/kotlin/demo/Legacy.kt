package demo

fun legacy(x: Int): Int {
    if (x > 5) {
        return 1
    }
    return 2
}

fun legacyElvis(s: String?): Int {
    val n = s
        ?: return 0
    return n.length
}

fun legacyTwo(): Int = 2
