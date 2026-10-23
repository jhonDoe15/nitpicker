export const LABEL = `package demo

class Label {
    fun larger(first: Int, second: Int): String = if (first > second) "first" else "second"
}
`;

export const LABEL_ONE_SIDED_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class LabelTest {
    @Test
    fun saysSecond() {
        assertEquals("second", Label().larger(1, 2))
    }
}
`;

export const SPREAD = `package demo

class Spread {
    fun one(): Int = 1

    fun length(text: String?, flag: Boolean): Int {
        val value = text
            ?: return 0
        if (
            flag
        ) {
            return value.length
        }
        return -value.length
    }
}
`;

export const SPREAD_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class SpreadTest {
    @Test
    fun countsOne() {
        assertEquals(1, Spread().one())
    }
}
`;

export const OFFSET = `package demo.offset

class Offset {
    fun sign(value: Int): Int = if (value > 0) 1 else -1
}
`;

export const GENERATED = `package demo

enum class Level { LOW, HIGH }

sealed interface Token

data class Word(val text: String) : Token

data object Stop : Token

class Generated {
    lateinit var tag: String

    fun describe(level: Level): String =
        when (level) {
            Level.LOW -> "low"
            Level.HIGH -> "high"
        }

    fun kind(token: Token): String =
        when (token) {
            is Word -> token.text
            Stop -> "stop"
        }

    fun shout(text: String, suffix: String = "!"): String = text.uppercase() + suffix

    fun forced(text: String?): Int = text!!.length

    fun tagged(): String = tag

    fun counted(): List<Int> =
        sequence {
            yield(1)
            yield(2)
        }.toList()
}
`;

export const GENERATED_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class GeneratedTest {
    private val generated = Generated()

    @Test
    fun coversEveryBranchTheAuthorWrote() {
        assertEquals("low", generated.describe(Level.LOW))
        assertEquals("high", generated.describe(Level.HIGH))
        assertEquals("hi", generated.kind(Word("hi")))
        assertEquals("stop", generated.kind(Stop))
        assertEquals("A!", generated.shout("a"))
        assertEquals("A?", generated.shout("a", "?"))
        assertEquals(2, generated.forced("ab"))
        assertFailsWith<NullPointerException> { generated.forced(null) }
        generated.tag = "t"
        assertEquals("t", generated.tagged())
        assertEquals(listOf(1, 2), generated.counted())
    }
}
`;

export const BROKEN = 'package demo\n\nclass Broken {\n    fun incomplete(: Int\n}\n';

export const LIBRARY_CALLS = `package demo

class Library {
    fun label(text: String?): String = text.orEmpty().trim()

    fun items(list: List<Int>?): List<Int> = list.orEmpty().sorted()

    fun blank(text: String?): Boolean = text.isNullOrBlank()

    fun widest(first: Long, second: Long): Long = maxOf(first, second)

    fun fallback(text: String?): String = text ?: "none"
}
`;

export const LIBRARY_CALLS_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class LibraryTest {
    @Test
    fun takesTheNonNullPaths() {
        val library = Library()
        assertEquals("a", library.label(" a "))
        assertEquals(listOf(1, 2), library.items(listOf(2, 1)))
        assertEquals(false, library.blank("a"))
        assertEquals(2L, library.widest(1L, 2L))
        assertEquals("a", library.fallback("a"))
    }
}
`;
