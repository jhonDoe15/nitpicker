package demo

import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers

@JvmInline
value class Id(val raw: Int) {
    fun next(): Id = Id(raw + 1)
}

inline fun <reified T> isType(x: Any): Boolean = x is T

data class Pair2(val a: String?, val b: Int?, val c: List<String>?)

sealed interface Shape {
    data class Sq(val s: Int, val label: String?) : Shape
    data class Ci(val r: Int) : Shape
}

fun area(s: Shape): Int = when (s) {
    is Shape.Sq -> s.s * s.s
    is Shape.Ci -> 3 * s.r * s.r
}

suspend fun io(x: Int): Int = withContext(Dispatchers.IO) { x + 1 }

fun mix(id: Id): Int = id.next().raw
