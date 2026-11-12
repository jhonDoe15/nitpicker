package com.example.library.app

import kotlin.test.Test
import kotlin.test.assertEquals

private const val AS_OF = "2026-03-31"

private fun lines(vararg rows: String): String = rows.joinToString("") { "$it\n" }

private fun captured(action: (Writer) -> Unit): String {
    val text = StringBuilder()
    action { text.append(it) }
    return text.toString()
}

private val memberListings =
    mapOf(
        "M1" to
            lines(
                "Loans for Ada Stone",
                "Dune: borrowed 2026-03-10, due 2026-03-24, 7d late",
                "The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late",
                "B99: borrowed 2026-02-15, due 2026-03-01, 30d late",
            ),
        "M2" to
            lines(
                "Loans for Grace Mill",
                "World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late",
                "Dune: borrowed 2026-03-12, due 2026-03-26, 5d late",
            ),
        "M3" to lines("Loans for Brian Cole", "Dune: borrowed 2026-02-20, due 2026-03-06, 25d late"),
        "M4" to
            lines(
                "Loans for Alan Fox",
                "Nature Monthly: borrowed 2026-03-07, returned 2026-03-23",
                "Dune: borrowed 2026-03-01, due 2026-03-15, 16d late",
            ),
        "M5" to
            lines(
                "Loans for Edgar Dunn",
                "The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late",
                "Dune: borrowed 2026-03-17, due 2026-03-31",
                "World Atlas: borrowed 2026-03-06, returned 2026-03-20",
            ),
        "M6" to
            lines(
                "Loans for Barbara Lane",
                "World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late",
                "The Gruffalo: borrowed 2026-03-24, due 2026-04-07",
            ),
    )

class LibraryTest {
    @Test
    fun listsTheCatalog() {
        assertEquals(
            lines(
                "B1 Dune (novel, 25c/day)",
                "B2 World Atlas (reference, 100c/day)",
                "B3 The Gruffalo (children, 10c/day)",
                "B4 Nature Monthly (periodical, 50c/day)",
            ),
            captured { catalogMain(it) },
        )
    }

    @Test
    fun listsEveryLoan() {
        assertEquals(
            lines(
                "M1: Dune: borrowed 2026-03-10, due 2026-03-24, 7d late",
                "M1: The Gruffalo: borrowed 2026-03-14, due 2026-03-28, 3d late",
                "M2: World Atlas: borrowed 2026-02-24, due 2026-03-10, 21d late",
                "M2: Dune: borrowed 2026-03-12, due 2026-03-26, 5d late",
                "M3: Dune: borrowed 2026-02-20, due 2026-03-06, 25d late",
                "M4: Nature Monthly: borrowed 2026-03-07, returned 2026-03-23",
                "M4: Dune: borrowed 2026-03-01, due 2026-03-15, 16d late",
                "M5: The Gruffalo: borrowed 2026-03-16, due 2026-03-30, 1d late",
                "M5: Dune: borrowed 2026-03-17, due 2026-03-31",
                "M5: World Atlas: borrowed 2026-03-06, returned 2026-03-20",
                "M6: World Atlas: borrowed 2026-03-06, due 2026-03-20, 11d late",
                "M6: The Gruffalo: borrowed 2026-03-24, due 2026-04-07",
                "M1: B99: borrowed 2026-02-15, due 2026-03-01, 30d late",
                "M99: Dune: borrowed 2026-02-16, due 2026-03-02, 29d late",
            ),
            captured { loansMain(AS_OF, it) },
        )
    }

    @Test
    fun listsTheLoansOfEachMember() {
        for ((memberId, expected) in memberListings) {
            assertEquals(expected, captured { memberLoansMain(memberId, AS_OF, it) }, memberId)
        }
    }

    @Test
    fun rejectsAnUnknownMember() {
        assertEquals(lines("Unknown member M42"), captured { memberLoansMain("M42", AS_OF, it) })
    }
}

class ExecuteTest {
    @Test
    fun runsTheCatalogCommand() {
        assertEquals(captured { catalogMain(it) }, captured { execute(listOf("catalog"), it) })
    }

    @Test
    fun runsTheLoansCommand() {
        assertEquals(captured { loansMain(AS_OF, it) }, captured { execute(listOf("loans", AS_OF), it) })
    }

    @Test
    fun runsTheMemberCommand() {
        assertEquals(
            memberListings.getValue("M4"),
            captured { execute(listOf("member", "M4", AS_OF), it) },
        )
    }

    @Test
    fun rejectsAnythingElse() {
        assertEquals(lines("Unknown command"), captured { execute(emptyList(), it) })
        assertEquals(lines("Unknown command"), captured { execute(listOf("unknown"), it) })
    }
}
