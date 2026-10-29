package com.example.settings

import com.example.app.printEntry
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.createDirectory
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

private fun parseFailure(text: String): String? =
    assertFailsWith<IllegalArgumentException> { parseSettings(text) }.message

private fun resolved(vararg settings: Pair<String, List<String>>): Resolution = Resolution.Resolved(mapOf(*settings))

private fun printedResolved(
    entry: String,
    sources: Map<String, String>,
): List<String> {
    val written = mutableListOf<String>()
    printResolved(entry, sources) { written.add(it) }
    return written
}

private fun printedEntry(entry: Path): List<String> {
    val written = mutableListOf<String>()
    printEntry(entry) { written.add(it) }
    return written
}

class QuotedItemsAcceptanceTest {
    @Test
    fun keepsSpacesAndCommasOfAQuotedItem() {
        assertEquals(
            mapOf("who" to listOf("  Ada , Countess  ", "x")),
            parseSettings("who = \"  Ada , Countess  \" , x"),
        )
        assertEquals(mapOf("a" to listOf(" ")), parseSettings("a = \" \""))
    }

    @Test
    fun readsEscapedQuotesAndBackslashes() {
        assertEquals(mapOf("a" to listOf("\"")), parseSettings("a = \"\\\"\""))
        assertEquals(mapOf("a" to listOf("\\")), parseSettings("a = \"\\\\\""))
        assertEquals(mapOf("a" to listOf("\\\"x\\")), parseSettings("a = \"\\\\\\\"x\\\\\""))
    }

    @Test
    fun keepsABackslashTogetherWithTheCharacterAfterIt() {
        assertEquals(mapOf("a" to listOf("\\d+", "\\ ")), parseSettings("a = \"\\d+\", \"\\ \""))
    }

    @Test
    fun treatsAQuoteThatDoesNotStartAnItemAsAnOrdinaryCharacter() {
        assertEquals(mapOf("a" to listOf("x \"y\"", "z\"")), parseSettings("a = x \"y\", z\""))
        assertEquals(mapOf("a" to listOf("5\"")), parseSettings("a = 5\""))
        assertEquals(mapOf("a" to listOf("ab\"c\"")), parseSettings("a = ab\"c\""))
    }

    @Test
    fun opensAQuotedItemAfterAComma() {
        assertEquals(mapOf("a" to listOf("x", "y, z")), parseSettings("a = x, \"y, z\""))
    }

    @Test
    fun readsTwoQuotesAsAnEmptyItemButNothingAsNoItems() {
        assertEquals(mapOf("a" to listOf("")), parseSettings("a = \"\""))
        assertEquals(mapOf("a" to emptyList<String>()), parseSettings("a ="))
        assertEquals(mapOf("a" to listOf("", "")), parseSettings("a = \"\" , \"\""))
    }

    @Test
    fun worksInTheAppendForm() {
        assertEquals(mapOf("k" to listOf("a", "b,c", "d")), parseSettings("k = a\nk+ = \"b,c\", d"))
        assertEquals(mapOf("k" to listOf("b, c")), parseSettings("k+ = \"b, c\""))
    }

    @Test
    fun rejectsAnythingButSpacesAfterAClosingQuote() {
        assertEquals("Line 3: unexpected text after closing quote", parseFailure("\n# c\nk = \"a\"b"))
        assertEquals("Line 1: unexpected text after closing quote", parseFailure("k = \"a\" \"b\""))
        assertEquals("Line 1: unexpected text after closing quote", parseFailure("k = \"a\"x,\"b\""))
    }

    @Test
    fun rejectsAQuoteThatIsNeverClosed() {
        assertEquals("Line 2: unterminated quote", parseFailure("a = 1\nb = \"x"))
        assertEquals("Line 1: unterminated quote", parseFailure("k = \"abc\\"))
        assertEquals("Line 1: unterminated quote", parseFailure("k = x, \""))
    }

    @Test
    fun reportsTheFirstProblemByLineAndKeepsTheKeyChecksFirst() {
        assertEquals("Line 1: invalid key k k", parseFailure("k k = \"abc"))
        assertEquals("Line 1: invalid key \"k\"", parseFailure("\"k\" = v"))
        assertEquals("Line 1: unterminated quote", parseFailure("k = \"abc\nj = \"a\"b"))
    }
}

class ResolveSettingsAcceptanceTest {
    @Test
    fun expandsAnIncludeAtItsPosition() {
        val sources = mapOf("app" to "a = 1\ninclude = shared\na+ = 3", "shared" to "a+ = 2")
        assertEquals(resolved("a" to listOf("1", "2", "3")), resolveSettings("app", sources))
    }

    @Test
    fun letsLinesAfterTheIncludeReplaceWhatItBroughtIn() {
        val sources = mapOf("app" to "include = shared\nlang = fr", "shared" to "lang = en\nname = Ada")
        assertEquals(resolved("lang" to listOf("fr"), "name" to listOf("Ada")), resolveSettings("app", sources))
    }

    @Test
    fun expandsASourceIncludedTwiceEachTime() {
        val sources = mapOf("app" to "x = 1\ninclude = b\ninclude = b", "b" to "y+ = z")
        assertEquals(resolved("x" to listOf("1"), "y" to listOf("z", "z")), resolveSettings("app", sources))
    }

    @Test
    fun expandsADiamondWithoutCallingItACycle() {
        val sources =
            mapOf(
                "top" to "include = left\ninclude = right",
                "left" to "include = base\nl = 1",
                "right" to "include = base\nr = 1",
                "base" to "b+ = x",
            )
        assertEquals(
            resolved("b" to listOf("x", "x"), "l" to listOf("1"), "r" to listOf("1")),
            resolveSettings("top", sources),
        )
    }

    @Test
    fun readsTheNameAfterTheFirstEqualsSignAndIgnoresSpacesAroundTheDirective() {
        val sources = mapOf("main" to "   include   =   my file  ", "my file" to "k = v")
        assertEquals(resolved("k" to listOf("v")), resolveSettings("main", sources))
        assertEquals(Resolution.MissingSource("a=b"), resolveSettings("main", mapOf("main" to "include = a=b")))
    }

    @Test
    fun onlyTheExactKeyIncludeIsADirective() {
        val sources =
            mapOf(
                "main" to "Include = base\nincludes = base\n  # include = base\ninclude + = base",
                "base" to "k = v",
            )
        assertEquals(
            resolved("Include" to listOf("base"), "includes" to listOf("base"), "include" to listOf("base")),
            resolveSettings("main", sources),
        )
    }

    @Test
    fun ignoresCommentAndBlankLinesOfIncludedSources() {
        val sources = mapOf("main" to "include = base", "base" to "# note\n\n  \nk = v\n")
        assertEquals(resolved("k" to listOf("v")), resolveSettings("main", sources))
    }

    @Test
    fun readsQuotedValuesAndAppendsAcrossSources() {
        val sources = mapOf("main" to "n = \"a, b\"\ninclude = more\nn+ = \"e\"", "more" to "n+ = c, \"d d\"")
        assertEquals(resolved("n" to listOf("a, b", "c", "d d", "e")), resolveSettings("main", sources))
    }

    @Test
    fun reportsAMissingEntryAndAMissingIncludeNestedDeep() {
        assertEquals(Resolution.MissingSource("app"), resolveSettings("app", mapOf("other" to "k = v")))
        assertEquals(
            Resolution.MissingSource("gone"),
            resolveSettings("a", mapOf("a" to "include = b", "b" to "k = 1\ninclude = gone")),
        )
    }

    @Test
    fun reportsAnEmptyIncludeWithTheSourceThatHoldsIt() {
        assertEquals(Resolution.EmptyInclude("a"), resolveSettings("a", mapOf("a" to "k = 1\ninclude =\n")))
        assertEquals(
            Resolution.EmptyInclude("b"),
            resolveSettings("a", mapOf("a" to "include = b", "b" to "  include =   ")),
        )
    }

    @Test
    fun reportsACycleWithTheChainFromTheEntryToTheRepeatedSource() {
        assertEquals(
            Resolution.IncludeCycle(listOf("a", "b", "a")),
            resolveSettings("a", mapOf("a" to "include = b", "b" to "include = a")),
        )
        assertEquals(
            Resolution.IncludeCycle(listOf("a", "b", "c", "d", "b")),
            resolveSettings(
                "a",
                mapOf("a" to "include = b", "b" to "include = c", "c" to "include = d", "d" to "include = b"),
            ),
        )
        assertEquals(
            Resolution.IncludeCycle(listOf("solo", "solo")),
            resolveSettings("solo", mapOf("solo" to "k = 1\ninclude = solo")),
        )
    }

    @Test
    fun throwsWhatParseSettingsThrowsForTheExpandedText() {
        val sources = mapOf("main" to "a = 1\ninclude = base\nz = 3", "base" to "ok = 1\nbad")
        val failure = assertFailsWith<IllegalArgumentException> { resolveSettings("main", sources) }
        assertEquals("Line 3: expected key=value", failure.message)
        val unterminated = mapOf("main" to "include = base", "base" to "\nk = \"abc")
        assertEquals(
            "Line 2: unterminated quote",
            assertFailsWith<IllegalArgumentException> { resolveSettings("main", unterminated) }.message,
        )
    }

    @Test
    fun leavesAnIncludeLineAnOrdinaryEntryForParseSettings() {
        assertEquals(mapOf("include" to listOf("base")), parseSettings("include = base"))
    }
}

class PrintResolvedAcceptanceTest {
    @Test
    fun printsTheResolvedSettingsInKeyOrder() {
        val sources = mapOf("main" to "z = 1\ninclude = base\nb+ = 3", "base" to "b = 2\na = \"x, y\", w")
        assertEquals(listOf("a = x, y, w\n", "b = 2, 3\n", "z = 1\n"), printedResolved("main", sources))
    }

    @Test
    fun printsAnEmptyListAsAnEmptyValue() {
        assertEquals(listOf("k = \n"), printedResolved("main", mapOf("main" to "k =")))
    }

    @Test
    fun printsASingleLineForAMissingSource() {
        assertEquals(listOf("Missing source cfg\n"), printedResolved("cfg", emptyMap()))
        assertEquals(listOf("Missing source two words\n"), printedResolved("a", mapOf("a" to "include = two words")))
    }

    @Test
    fun printsASingleLineForACycle() {
        val sources = mapOf("a" to "include = b", "b" to "include = c", "c" to "include = a")
        assertEquals(listOf("Include cycle: a -> b -> c -> a\n"), printedResolved("a", sources))
        assertEquals(listOf("Include cycle: a -> a\n"), printedResolved("a", mapOf("a" to "include = a")))
    }

    @Test
    fun printsASingleLineForAnEmptyInclude() {
        val sources = mapOf("main" to "include = base", "base" to "include =")
        assertEquals(listOf("Empty include in base\n"), printedResolved("main", sources))
    }

    @Test
    fun printsLikePrintSettingsWhenThereIsNoInclude() {
        val text = "b = 2\n# note\na = \"q\", r"
        val plain = mutableListOf<String>()
        printSettings(text) { plain.add(it) }
        assertEquals(plain, printedResolved("only", mapOf("only" to text)))
        assertEquals(listOf("a = q, r\n", "b = 2\n"), plain)
    }
}

class PrintEntryAcceptanceTest {
    @Test
    fun resolvesTheIncludesOfTheFilesNextToTheEntry() {
        val directory = Files.createTempDirectory("acceptance")
        directory.resolve("defaults.cfg").writeText("color = red\nsizes = \"s, m\", l")
        directory.resolve("local.cfg").writeText("include = defaults.cfg\ncolor = blue")
        directory.resolve("unrelated.txt").writeText("not = used")
        directory.resolve("subdirectory").createDirectory()
        assertEquals(listOf("color = blue\n", "sizes = s, m, l\n"), printedEntry(directory.resolve("local.cfg")))
    }

    @Test
    fun printsASingleLineWhenAnIncludeCannotBeResolved() {
        val directory = Files.createTempDirectory("acceptance")
        directory.resolve("one.cfg").writeText("include = two.cfg")
        directory.resolve("two.cfg").writeText("include = one.cfg")
        assertEquals(
            listOf("Include cycle: one.cfg -> two.cfg -> one.cfg\n"),
            printedEntry(directory.resolve("one.cfg")),
        )
        directory.resolve("three.cfg").writeText("include = ghost.cfg")
        assertEquals(listOf("Missing source ghost.cfg\n"), printedEntry(directory.resolve("three.cfg")))
    }

    @Test
    fun stillPrintsAFileWithoutIncludes() {
        val directory = Files.createTempDirectory("acceptance")
        directory.resolve("plain.cfg").writeText("b = 1\na = \"x y\"")
        assertEquals(listOf("a = x y\n", "b = 1\n"), printedEntry(directory.resolve("plain.cfg")))
    }
}
