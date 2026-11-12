package com.example.settings

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

private fun failureMessage(text: String): String? =
    assertFailsWith<IllegalArgumentException> { parseSettings(text) }.message

private fun resolved(vararg settings: Pair<String, List<String>>): Resolution = Resolution.Resolved(mapOf(*settings))

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

class QuotedValuesTest {
    @Test
    fun keepsSpacesAndCommasInsideQuotes() {
        assertEquals(
            mapOf("names" to listOf("Stone, Ada", " Grace ")),
            parseSettings("names = \"Stone, Ada\", \" Grace \""),
        )
    }

    @Test
    fun readsAnEscapedQuoteAndAnEscapedBackslash() {
        assertEquals(
            mapOf("motto" to listOf("say \"hi\"", "c:\\dir")),
            parseSettings("motto = \"say \\\"hi\\\"\", \"c:\\\\dir\""),
        )
    }

    @Test
    fun keepsABackslashBeforeAnyOtherCharacter() {
        assertEquals(mapOf("text" to listOf("a\\nb")), parseSettings("text = \"a\\nb\""))
    }

    @Test
    fun ignoresSpacesAroundAQuotedItem() {
        assertEquals(mapOf("tags" to listOf("a", "b", "c")), parseSettings("tags =   \"a\"  ,  \"b\"   ,c"))
    }

    @Test
    fun readsTwoQuotesAsAnEmptyItem() {
        assertEquals(mapOf("tags" to listOf("")), parseSettings("tags = \"\""))
        assertEquals(mapOf("tags" to listOf("", "a")), parseSettings("tags = \"\",a"))
    }

    @Test
    fun keepsAnEmptyItemAfterAQuotedOne() {
        assertEquals(mapOf("tags" to listOf("a", "")), parseSettings("tags = \"a\","))
    }

    @Test
    fun worksWithKeyPlus() {
        assertEquals(mapOf("paths" to listOf("a", "b, c")), parseSettings("paths = a\npaths+ = \"b, c\""))
    }

    @Test
    fun rejectsTextAfterAClosingQuote() {
        assertEquals("Line 2: unexpected text after closing quote", failureMessage("# x\ntags = \"a\" b"))
        assertEquals("Line 1: unexpected text after closing quote", failureMessage("tags = \"a\" bc, \"d"))
    }

    @Test
    fun rejectsAQuoteThatIsNeverClosed() {
        assertEquals("Line 1: unterminated quote", failureMessage("tags = \"a, b"))
        assertEquals("Line 1: unterminated quote", failureMessage("tags = \"a\\\""))
        assertEquals("Line 1: unterminated quote", failureMessage("tags = \"a\\"))
    }
}

class ResolveSettingsTest {
    @Test
    fun resolvesASourceWithoutIncludesLikeParseSettings() {
        assertEquals(resolved("name" to listOf("Ada")), resolveSettings("main", mapOf("main" to "name = Ada")))
    }

    @Test
    fun splicesAnIncludedSourceInPlaceOfTheIncludeLine() {
        val sources =
            mapOf(
                "main" to "name = Ada\n  include =  base  \nlang = fr",
                "base" to "lang = en\ncolor = red",
            )
        assertEquals(
            resolved("name" to listOf("Ada"), "lang" to listOf("fr"), "color" to listOf("red")),
            resolveSettings("main", sources),
        )
    }

    @Test
    fun letsLaterLinesAppendToWhatAnIncludeBroughtIn() {
        val sources = mapOf("main" to "include=base\npaths+ = b", "base" to "paths = a")
        assertEquals(resolved("paths" to listOf("a", "b")), resolveSettings("main", sources))
    }

    @Test
    fun resolvesIncludesOfIncludesAndASourceIncludedTwice() {
        val sources =
            mapOf(
                "a" to "include=b\ninclude=c\nx+ = a",
                "b" to "include=d\nx+ = b",
                "c" to "include=d\nx+ = c",
                "d" to "x+ = d",
            )
        assertEquals(resolved("x" to listOf("d", "b", "d", "c", "a")), resolveSettings("a", sources))
    }

    @Test
    fun doesNotTreatOtherKeysCommentsOrValuesAsIncludes() {
        val sources = mapOf("main" to "# include=base\ninclude2 = base\nnote = include=base\ninclude+ = base")
        assertEquals(
            resolved("include2" to listOf("base"), "note" to listOf("include=base"), "include" to listOf("base")),
            resolveSettings("main", sources),
        )
    }

    @Test
    fun reportsASourceThatIsNotThere() {
        assertEquals(Resolution.MissingSource("main"), resolveSettings("main", emptyMap()))
        assertEquals(
            Resolution.MissingSource("none"),
            resolveSettings("main", mapOf("main" to "include = none")),
        )
    }

    @Test
    fun reportsTheProblemOfAnIncludeThatComesBeforeMoreLines() {
        assertEquals(
            Resolution.MissingSource("none"),
            resolveSettings("main", mapOf("main" to "include = none\nx = 1")),
        )
        assertEquals(
            Resolution.MissingSource("none"),
            resolveSettings("main", mapOf("main" to "x = 1\ninclude = none\ny = 2")),
        )
    }

    @Test
    fun readsAnIncludeLineThatEndsWithACarriageReturn() {
        val sources = mapOf("main" to "include = base\r\nx = 1", "base" to "y = 2")
        assertEquals(resolved("y" to listOf("2"), "x" to listOf("1")), resolveSettings("main", sources))
    }

    @Test
    fun reportsAnIncludeWithoutAName() {
        assertEquals(
            Resolution.EmptyInclude("main"),
            resolveSettings("main", mapOf("main" to "include = ", "other" to "")),
        )
        assertEquals(
            Resolution.EmptyInclude("base"),
            resolveSettings("main", mapOf("main" to "include = base", "base" to "include=")),
        )
    }

    @Test
    fun reportsACycleWithTheChainOfSources() {
        assertEquals(
            Resolution.IncludeCycle(listOf("a", "b", "a")),
            resolveSettings("a", mapOf("a" to "include=b", "b" to "include=a")),
        )
        assertEquals(Resolution.IncludeCycle(listOf("a", "a")), resolveSettings("a", mapOf("a" to "include=a")))
        assertEquals(
            Resolution.IncludeCycle(listOf("a", "b", "c", "b")),
            resolveSettings("a", mapOf("a" to "include=b", "b" to "include=c", "c" to "include=b")),
        )
    }

    @Test
    fun throwsWhatParseSettingsThrowsForTheExpandedText() {
        val sources = mapOf("main" to "a = 1\ninclude=base\nz = 3", "base" to "oops")
        val failure = assertFailsWith<IllegalArgumentException> { resolveSettings("main", sources) }
        assertEquals("Line 2: expected key=value", failure.message)
    }

    @Test
    fun readsQuotedValuesInIncludedSources() {
        val sources = mapOf("main" to "include=base", "base" to "names = \"a, b\"")
        assertEquals(resolved("names" to listOf("a, b")), resolveSettings("main", sources))
    }
}

class PrintSettingsTest {
    private fun printed(
        entry: String,
        sources: Map<String, String>,
    ): List<String> {
        val written = mutableListOf<String>()
        printResolved(entry, sources) { written.add(it) }
        return written
    }

    @Test
    fun writesOneLinePerKeyInKeyOrder() {
        val written = mutableListOf<String>()
        printSettings("b = 2, 3\na = 1") { written.add(it) }
        assertEquals(listOf("a = 1\n", "b = 2, 3\n"), written)
    }

    @Test
    fun printsTheResolvedSettingsLikePrintSettings() {
        val sources = mapOf("main" to "b = 2, 3\ninclude = base", "base" to "a = 1")
        assertEquals(listOf("a = 1\n", "b = 2, 3\n"), printed("main", sources))
    }

    @Test
    fun printsOneLineForEachKindOfFailure() {
        assertEquals(listOf("Missing source main\n"), printed("main", emptyMap()))
        val cycle = mapOf("a" to "include=b", "b" to "include=a")
        assertEquals(listOf("Include cycle: a -> b -> a\n"), printed("a", cycle))
        assertEquals(listOf("Empty include in main\n"), printed("main", mapOf("main" to "include =")))
    }
}
