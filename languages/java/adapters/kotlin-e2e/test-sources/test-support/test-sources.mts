export const LEGACY_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class ParsingTest {
    @Test
    fun parses() {
        val value =
            try {
                "7".toInt()
            } catch (error: Exception) {
                error.hashCode()
            }
        assertEquals(7, value)
    }
}
`;

export const LEGACY_TEST_MOVED = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

// The parser is covered below.
class ParsingTest {
    @Test
    fun parses() {
        val value =
            try {
                "7".toInt()
            } catch (error: Exception) {
                error.hashCode()
            }
        assertEquals(7, value)
    }
}
`;

export const SHOUTING_TEST = `package demo

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class ShoutingTest {
    private lateinit var shouted: String

    @Test
    fun shouts() {
        val text: String? = "ada"
        shouted = text!!.uppercase()
        assertEquals("ADA", shouted)
        assertEquals(3600, runBlocking { 3600 })
    }

    @Test
    fun parses() {
        val value =
            try {
                "7".toInt()
            } catch (error: Exception) {
                error.hashCode()
            }
        assertEquals(7, value)
    }

    @Test
    fun ignores() {
        val value =
            try {
                "8".toInt()
            } catch (ignored: Exception) {
                0
            }
        assertEquals(8, value)
    }

  @Test
  fun misindented() {
        assertEquals(1, 1)
  }
}
`;

export const SUPPRESSED_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class SuppressedTest {
    @Test
    @Suppress("TooGenericExceptionCaught")
    fun parses() {
        val value =
            try {
                "7".toInt()
            } catch (error: Exception) {
                error.hashCode()
            }
        assertEquals(7, value)
    }
}
`;
