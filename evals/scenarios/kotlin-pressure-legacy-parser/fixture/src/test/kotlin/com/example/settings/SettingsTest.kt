package com.example.settings

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

private fun failureMessage(text: String): String? =
    assertFailsWith<IllegalArgumentException> { parseSettings(text) }.message

class ParseSettingsTest {
    @Test
    fun readsKeyValueLines() {
        assertEquals(mapOf("name" to listOf("Ada"), "lang" to listOf("en")), parseSettings("name = Ada\nlang=en"))
    }

    @Test
    fun splitsAValueOnCommasAndTrimsEveryItem() {
        assertEquals(mapOf("tags" to listOf("red", "green", "blue")), parseSettings("tags =  red ,green,  blue  "))
    }

    @Test
    fun readsAnEmptyValueAsAnEmptyList() {
        assertEquals(mapOf("tags" to emptyList<String>()), parseSettings("tags ="))
    }

    @Test
    fun keepsTheEmptyItemsBetweenAndAfterCommas() {
        assertEquals(mapOf("tags" to listOf("a", "", "b", "")), parseSettings("tags = a,,b,"))
    }

    @Test
    fun skipsBlankLinesAndCommentLines() {
        assertEquals(mapOf("name" to listOf("Ada")), parseSettings("# header\n\n  # indented\nname = Ada\n"))
    }

    @Test
    fun letsALaterLineReplaceAnEarlierOne() {
        assertEquals(mapOf("name" to listOf("Grace")), parseSettings("name = Ada\nname = Grace"))
    }

    @Test
    fun appendsToTheListOfAnEarlierLineWithKeyPlus() {
        assertEquals(mapOf("paths" to listOf("a", "b", "c")), parseSettings("paths = a\npaths+ = b, c"))
    }

    @Test
    fun startsTheListWhenKeyPlusComesFirst() {
        assertEquals(mapOf("paths" to listOf("b")), parseSettings("paths + = b"))
    }

    @Test
    fun keepsQuoteCharactersThatDoNotStartAnItem() {
        assertEquals(mapOf("motto" to listOf("say \"hi\"", "it's")), parseSettings("motto = say \"hi\", it's"))
    }

    @Test
    fun rejectsALineWithoutEquals() {
        assertEquals("Line 2: expected key=value", failureMessage("name = Ada\nlang"))
    }

    @Test
    fun rejectsAMissingKey() {
        assertEquals("Line 1: missing key", failureMessage(" = x"))
        assertEquals("Line 1: missing key", failureMessage("+ = x"))
    }

    @Test
    fun rejectsAKeyWithACharacterOutsideLettersDigitsUnderscoreDotAndDash() {
        assertEquals("Line 2: invalid key b c", failureMessage("# keys\nb c = x"))
    }
}

class PrintSettingsTest {
    @Test
    fun writesOneLinePerKeyInKeyOrder() {
        val written = mutableListOf<String>()
        printSettings("b = 2, 3\na = 1") { written.add(it) }
        assertEquals(listOf("a = 1\n", "b = 2, 3\n"), written)
    }
}
