package demo

import kotlinx.coroutines.delay

suspend fun fetch(id: Int): String {
    delay(1)
    val first = if (id > 0) "pos" else "neg"
    delay(1)
    return "$first$id"
}

suspend fun fetchAll(ids: List<Int>): List<String> {
    val result = mutableListOf<String>()
    for (id in ids) {
        result.add(fetch(id))
    }
    return result
}

fun evens(values: List<Int>): List<Int> = values.filter { it % 2 == 0 }.map { it * 2 }

fun maybe(values: List<Int>): Int? = values.firstOrNull { it > 2 }

fun tryUse(value: String?): Int {
    val text = value ?: return -1
    return text.length
}
