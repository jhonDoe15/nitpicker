package com.example.billing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

private fun written(split: Split): List<String> {
    val lines = mutableListOf<String>()
    formatShares(split) { lines.add(it) }
    return lines
}

private fun failureMessage(
    totalCents: Long,
    people: List<String>,
): String? = assertFailsWith<IllegalArgumentException> { splitBill(totalCents, people) }.message

class SplitBillTest {
    @Test
    fun splitsAnEvenTotalEqually() {
        assertEquals(
            Split(listOf(Share("Ann", 300), Share("Ben", 300), Share("Cy", 300)), 900),
            splitBill(900, listOf("Ann", "Ben", "Cy")),
        )
    }

    @Test
    fun givesOnePersonTheWholeBill() {
        assertEquals(Split(listOf(Share("Ann", 1234)), 1234), splitBill(1234, listOf("Ann")))
    }

    @Test
    fun keepsTheInputOrderOfThePeople() {
        val split = splitBill(1000, listOf("Zed", "Amy"))
        assertEquals(listOf("Zed", "Amy"), split.shares.map { it.name })
    }

    @Test
    fun splitsAZeroTotalIntoZeroShares() {
        assertEquals(
            Split(listOf(Share("Ann", 0), Share("Ben", 0)), 0),
            splitBill(0, listOf("Ann", "Ben")),
        )
    }

    @Test
    fun trimsNamesAndCollapsesRunsOfSpaces() {
        val split = splitBill(200, listOf("  Ann ", "Ben \t", "Cy   Lee"))
        assertEquals(listOf("Ann", "Ben", "Cy Lee"), split.shares.map { it.name })
    }

    @Test
    fun cutsANameTo24Characters() {
        assertEquals(
            listOf(Share("A".repeat(24), 100)),
            splitBill(100, listOf("A".repeat(30))).shares,
        )
    }

    @Test
    fun allowsTwelvePeopleAndNoMore() {
        val twelve = (0 until 12).map { "P$it" }
        assertEquals(12, splitBill(1200, twelve).shares.size)
        assertEquals("At most 12 people", failureMessage(1300, twelve + "P12"))
    }

    @Test
    fun rejectsABlankName() {
        assertEquals("Blank name at position 1", failureMessage(100, listOf("Ann", "  ")))
    }

    @Test
    fun rejectsANameWithAComma() {
        assertEquals(
            "Name must not contain a comma: Smith, Ann",
            failureMessage(100, listOf("Smith, Ann")),
        )
    }

    @Test
    fun rejectsATotalAboveOneMillionDollars() {
        assertEquals(100000000, splitBill(100000000, listOf("Ann")).totalCents)
        assertEquals("Total is too large", failureMessage(100000001, listOf("Ann")))
    }

    @Test
    fun rejectsADuplicateNameIgnoringCaseAndSpaces() {
        assertEquals("Duplicate name ann", failureMessage(100, listOf("Ann", " ann")))
    }

    @Test
    fun rejectsANegativeTotal() {
        assertEquals("Total must not be negative", failureMessage(-1, listOf("Ann")))
    }
}

class FormatSharesTest {
    @Test
    fun writesOneAlignedLinePerShareAndATotal() {
        assertEquals(
            listOf("Ann  $4.50\n", "Cy   $4.50\n", "Total: $9.00\n"),
            written(splitBill(900, listOf("Ann", "Cy"))),
        )
    }

    @Test
    fun padsEveryNameToTheLongestOne() {
        assertEquals(
            listOf("Bartholomew  $5.00\n", "Al           $5.00\n", "Cy           $5.00\n", "Total: $15.00\n"),
            written(splitBill(1500, listOf("Bartholomew", "Al", "Cy"))),
        )
    }
}
