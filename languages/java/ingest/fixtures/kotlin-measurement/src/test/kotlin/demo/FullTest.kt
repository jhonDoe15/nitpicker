package demo

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class FullTest {
    @Test
    fun shapes() {
        assertEquals(12.0, area(Shape.Circle(2.0)))
        assertEquals(4.0, area(Shape.Square(2.0)))
        assertEquals(0.0, area(Shape.Empty))
        assertEquals(Shape.Circle(2.0), Shape.Circle(2.0))
        assertEquals(Shape.Circle(2.0).hashCode(), Shape.Circle(2.0).hashCode())
        assertEquals("Circle(radius=2.0)", Shape.Circle(2.0).toString())
    }

    @Test
    fun whens() {
        assertEquals("f00", hex(Color.RED))
        assertEquals("0f0", hex(Color.GREEN))
        assertEquals("00f", hex(Color.BLUE))
        assertEquals("one", describe(1))
        assertEquals("two", describe(2))
        assertEquals("many", describe(3))
        assertEquals(1, word("a"))
        assertEquals(2, word("b"))
        assertEquals(0, word("c"))
    }

    @Test
    fun nulls() {
        val named = Person("Ada", "A")
        val anonymous = Person("Bob", null)
        assertEquals("A", named.display())
        assertEquals("Bob", anonymous.display())
        assertEquals(1, named.nickLength())
        assertEquals(0, anonymous.nickLength())
        assertEquals(1, named.forced())
        assertFailsWith<NullPointerException> { anonymous.forced() }
        assertEquals("x", named.castOrNull("x"))
        assertNull(named.castOrNull(1))
        assertEquals("x", named.cast("x"))
        assertFailsWith<ClassCastException> { named.cast(1) }
        named.tag = "t"
        assertEquals("t", named.tagged())
        assertFailsWith<UninitializedPropertyAccessException> { anonymous.tagged() }
    }

    @Test
    fun defaults() {
        assertEquals("Hello, Ada!", greet("Ada"))
        assertEquals("Hi, Ada!", greet("Ada", "Hi"))
        assertEquals("Hi, Ada?", greet("Ada", "Hi", "?"))
        assertEquals("abab", overloaded("ab"))
        assertEquals("ab", overloaded("ab", 1))
    }

    @Test
    fun inlines() {
        assertEquals(6, useInline(3))
        assertEquals(6, useInline(-3))
        assertEquals("negative", classify(-1))
        assertEquals("zero", classify(0))
        assertEquals("positive", classify(1))
    }

    @Test
    fun logic() {
        assertEquals(true, both(true, true))
        assertEquals(false, both(true, false))
        assertEquals(false, both(false, true))
        assertEquals(true, either(true, false))
        assertEquals(true, either(false, true))
        assertEquals(false, either(false, false))
        assertEquals(6, loop(listOf(1, 2, 3)))
        assertEquals(0, loop(emptyList()))
        assertEquals(5, safeParse("5"))
        assertEquals(-1, safeParse("x"))
        val counter = Counter.create()
        counter.increment()
        assertEquals(11, counter.count)
    }

    @Test
    fun flow() = runTest {
        assertEquals("pos1", fetch(1))
        assertEquals("neg0", fetch(0))
        assertEquals(listOf("pos1", "neg0"), fetchAll(listOf(1, 0)))
        assertEquals(emptyList(), fetchAll(emptyList()))
        assertEquals(listOf(4), evens(listOf(1, 2, 3)))
        assertEquals(3, maybe(listOf(1, 3)))
        assertNull(maybe(listOf(1)))
        assertEquals(-1, tryUse(null))
        assertEquals(2, tryUse("ab"))
    }
}
