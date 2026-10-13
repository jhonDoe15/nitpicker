package demo

import java.io.StringReader
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class MoreTest {
    @Test
    fun loops() {
        assertEquals(13, rangeSum(3))
        assertEquals(0, rangeSum(0))
        assertEquals("0a1b01", indexed(listOf("a", "b")))
        assertEquals("", indexed(emptyList()))
        assertEquals(3, whiles(0))
        assertEquals(3, whiles(1))
        assertEquals(5, whiles(4))
    }

    @Test
    fun branches() {
        assertEquals(true, inRange(3))
        assertEquals(false, inRange(0))
        assertEquals(false, inRange(6))
        assertEquals("neg", subjectless(-1))
        assertEquals("zero", subjectless(0))
        assertEquals("pos", subjectless(1))
        assertEquals(2, smart("ab"))
        assertEquals(-1, smart(1.5))
        assertEquals(7, smart(7))
        assertEquals(3, lets("ab"))
        assertEquals(0, lets(null))
        assertEquals(6, applies(listOf(1, 2, 3)))
        assertEquals(97, finals(StringReader("a")))
        assertEquals(97, uses(StringReader("a")))
        assertEquals("lazy", lazyValue)
    }

    @Test
    fun classes() {
        assertEquals("none", Holder().toString())
        assertEquals("x", Holder("x").toString())
        assertEquals(1, Holder(listOf(1)).check())
        assertFailsWith<IllegalStateException> { Holder().check() }
        assertFailsWith<IllegalArgumentException> { Holder(List(100) { it }) }
        assertEquals("woof", Dog().sound())
        assertEquals("...", Fish().sound())
        assertEquals(listOf(1, 2), sequences())
        assertEquals(5, failing(5))
        assertEquals(1, unreachable(Color.RED))
    }
}
