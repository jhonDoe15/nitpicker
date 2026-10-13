package demo

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class CoroTest {
    @Test
    fun coroutines() = runTest {
        assertEquals(listOf(1, 2), collected())
        assertEquals("ok1", safeFetch(1))
        assertEquals("bad", safeFetch(-1))
        assertEquals(3, parallel(coroutineContext))
    }

    @Test
    fun misc() {
        assertEquals("A", grade(95))
        assertEquals("B", grade(85))
        assertEquals("C", grade(1))
        assertEquals(4.0, Meters(2.0).doubled().value)
        Registry.size = 5
        assertEquals(5, Registry.last)
        Registry.reset()
        assertEquals(0, Registry.last)
        assertEquals("A!", "a".shout)
        assertEquals("-", null.orDash())
        assertEquals("-", "".orDash())
        assertEquals("x", "x".orDash())
        assertEquals(listOf("a"), pairs(mapOf("a" to 1, "b" to 0)))
        assertEquals("ab", built(listOf("a", "b")))
        assertEquals("", built(emptyList()))
    }
}
