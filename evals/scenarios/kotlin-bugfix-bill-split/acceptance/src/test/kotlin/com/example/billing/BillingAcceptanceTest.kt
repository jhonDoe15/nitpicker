package com.example.billing

import com.example.app.printSplit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

private val names = listOf("Ann", "Ben", "Cy", "Dee", "Eli", "Flo", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou")

private fun written(split: Split): List<String> {
    val lines = mutableListOf<String>()
    formatShares(split) { lines.add(it) }
    return lines
}

private fun expectedShares(
    totalCents: Long,
    count: Int,
): List<Long> = (0 until count).map { position -> totalCents / count + if (position < totalCents % count) 1 else 0 }

private fun failureMessage(
    totalCents: Long,
    people: List<String>,
): String? = assertFailsWith<IllegalArgumentException> { splitBill(totalCents, people) }.message

class RemainderCentsAcceptanceTest {
    @Test
    fun givesTheReportedExample() {
        assertEquals(
            Split(listOf(Share("Ann", 334), Share("Ben", 333), Share("Cy", 333)), 1000),
            splitBill(1000, listOf("Ann", "Ben", "Cy")),
        )
    }

    @Test
    fun noLongerOverAssignsWhenTheShareRoundsUp() {
        assertEquals(
            Split(listOf(Share("Ann", 667), Share("Ben", 667), Share("Cy", 666)), 2000),
            splitBill(2000, listOf("Ann", "Ben", "Cy")),
        )
    }

    @Test
    fun givesTheExtraCentsToTheFirstPeopleInInputOrderNotToTheLast() {
        assertEquals(
            Split(listOf(Share("Zed", 3), Share("Amy", 3), Share("Bob", 2), Share("Cal", 2)), 10),
            splitBill(10, listOf("Zed", "Amy", "Bob", "Cal")),
        )
    }

    @Test
    fun splitsManyTotalsExactly() {
        val cases =
            listOf<Pair<Long, Int>>(
                0L to 1,
                0L to 5,
                1L to 1,
                1L to 2,
                1L to 12,
                2L to 3,
                5L to 7,
                6L to 7,
                7L to 7,
                8L to 7,
                100L to 3,
                101L to 3,
                102L to 3,
                999L to 4,
                1000L to 12,
                1001L to 12,
                1011L to 12,
                99999999L to 11,
                100000000L to 12,
                100000000L to 7,
            )
        for ((totalCents, count) in cases) {
            val people = names.take(count)
            val expected = expectedShares(totalCents, count)
            assertEquals(
                Split(people.mapIndexed { position, name -> Share(name, expected[position]) }, totalCents),
                splitBill(totalCents, people),
                "$totalCents cents among $count people",
            )
            assertEquals(totalCents, expected.sum())
        }
    }

    @Test
    fun appliesTheRuleToTrimmedAndCutNamesInInputOrder() {
        assertEquals(
            Split(listOf(Share("Ann", 34), Share("Ben", 34), Share("C".repeat(24), 33)), 101),
            splitBill(101, listOf("  Ann ", "Ben\t", "C".repeat(30))),
        )
    }

    @Test
    fun printsTheRemainderOnTheFirstLines() {
        assertEquals(
            listOf("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"),
            written(splitBill(1000, listOf("Ann", "Ben", "Cy"))),
        )
        assertEquals(
            listOf("Ann  $6.67\n", "Ben  $6.67\n", "Cy   $6.66\n", "Total: $20.00\n"),
            written(splitBill(2000, listOf("Ann", "Ben", "Cy"))),
        )
    }

    @Test
    fun writesTheRemainderThroughThePrintFunction() {
        val lines = mutableListOf<String>()
        printSplit(1000, listOf("Ann", "Ben", "Cy")) { lines.add(it) }
        assertEquals(listOf("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"), lines)
    }
}

class NoPeopleAcceptanceTest {
    @Test
    fun returnsTheFailureResultForEveryTotal() {
        for (totalCents in listOf(0L, 1L, 1000L, 100000000L)) {
            val result = splitBill(totalCents, emptyList())
            assertEquals(Split(emptyList(), totalCents, SplitFailure.NO_PEOPLE), result)
            assertEquals(emptyList(), result.shares)
            assertEquals(totalCents, result.totalCents)
            assertEquals(SplitFailure.NO_PEOPLE, result.failure)
        }
    }

    @Test
    fun hasNoFailureOnASuccessfulSplit() {
        assertNull(splitBill(1000, listOf("Ann", "Ben")).failure)
        assertNull(splitBill(0, listOf("Ann")).failure)
    }

    @Test
    fun printsASingleLineForTheFailureResult() {
        assertEquals(listOf("Nobody to split between\n"), written(splitBill(1000, emptyList())))
    }

    @Test
    fun printsTheSameSingleLineThroughThePrintFunction() {
        val lines = mutableListOf<String>()
        printSplit(1000, emptyList()) { lines.add(it) }
        assertEquals(listOf("Nobody to split between\n"), lines)
    }

    @Test
    fun checksTheTotalBeforeLookingAtThePeople() {
        assertEquals("Total must not be negative", failureMessage(-1, emptyList()))
        assertEquals("Total is too large", failureMessage(100000001, emptyList()))
    }
}

class UnchangedBehaviorAcceptanceTest {
    @Test
    fun splitsAnEvenTotalEqually() {
        assertEquals(
            Split(listOf(Share("Ann", 300), Share("Ben", 300), Share("Cy", 300)), 900),
            splitBill(900, listOf("Ann", "Ben", "Cy")),
        )
    }

    @Test
    fun keepsEveryValidationMessageAndItsOrder() {
        assertEquals("Blank name at position 1", failureMessage(100, listOf("Ann", "  ")))
        assertEquals(
            "Name must not contain a comma: Smith, Ann",
            failureMessage(100, listOf("Smith, Ann")),
        )
        assertEquals("Duplicate name ann", failureMessage(100, listOf("Ann", " ann")))
        assertEquals("At most 12 people", failureMessage(100, names + "Max"))
        assertEquals("Total is too large", failureMessage(100000001, listOf("Ann")))
        assertEquals("Total must not be negative", failureMessage(-1, listOf("Ann")))
    }

    @Test
    fun checksTheBlankNameBeforeTheComma() {
        assertEquals("Blank name at position 0", failureMessage(100, listOf(" ", "A,B")))
    }

    @Test
    fun stillRejectsNamesThatOnlyCollideAfterCutting() {
        assertEquals(
            "Duplicate name ${"A".repeat(24)}",
            failureMessage(100, listOf("A".repeat(30), "A".repeat(25))),
        )
    }

    @Test
    fun stillCollapsesRunsOfSpacesInsideANameAndRejectsTheCollidingOnes() {
        assertEquals(
            listOf("Cy Lee"),
            splitBill(100, listOf("Cy    Lee")).shares.map { it.name },
        )
        assertEquals("Duplicate name cy lee", failureMessage(100, listOf("Cy Lee", "cy  lee")))
    }

    @Test
    fun padsNamesToTheLongestOne() {
        assertEquals(
            listOf("Bartholomew  $5.00\n", "Al           $5.00\n", "Cy           $5.00\n", "Total: $15.00\n"),
            written(splitBill(1500, listOf("Bartholomew", "Al", "Cy"))),
        )
    }

    @Test
    fun printsAZeroTotalAsZeroShares() {
        assertEquals(
            listOf("Ann  $0.00\n", "Ben  $0.00\n", "Total: $0.00\n"),
            written(splitBill(0, listOf("Ann", "Ben"))),
        )
    }

    @Test
    fun formatsCentsUnderTenWithALeadingZero() {
        assertEquals(listOf("Ann  $2.05\n", "Total: $2.05\n"), written(splitBill(205, listOf("Ann"))))
    }
}
