package com.example.billing

import com.example.app.printSplit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

private val trio = listOf("Ann", "Ben", "Cy")

private fun cents(split: Split): List<Long> = split.shares.map { it.cents }

class RemainderCentsTest {
    @Test
    fun givesTheLeftOverCentToTheFirstPerson() {
        assertEquals(Split(listOf(Share("Ann", 334), Share("Ben", 333), Share("Cy", 333)), 1000), splitBill(1000, trio))
    }

    @Test
    fun doesNotOverAssignWhenTheShareWouldRoundUp() {
        assertEquals(Split(listOf(Share("Ann", 667), Share("Ben", 667), Share("Cy", 666)), 2000), splitBill(2000, trio))
    }

    @Test
    fun givesTheExtraCentsToThePeopleInTheOrderTheyWereGiven() {
        val split = splitBill(10, listOf("Zed", "Amy", "Bob", "Cal"))
        assertEquals(listOf("Zed", "Amy", "Bob", "Cal"), split.shares.map { it.name })
        assertEquals(listOf<Long>(3, 3, 2, 2), cents(split))
    }

    @Test
    fun splitsATotalSmallerThanThePartyOneCentAtATime() {
        assertEquals(listOf<Long>(1, 1, 0), cents(splitBill(2, trio)))
        assertEquals(listOf<Long>(1, 0), cents(splitBill(1, listOf("Ann", "Ben"))))
    }

    @Test
    fun splitsAZeroTotalIntoZeroShares() {
        assertEquals(listOf<Long>(0, 0, 0), cents(splitBill(0, trio)))
    }

    @Test
    fun splitsAnEvenTotalEqually() {
        assertEquals(listOf<Long>(300, 300, 300), cents(splitBill(900, trio)))
    }

    @Test
    fun keepsTheSharesSummingToTheTotal() {
        val split = splitBill(1001, trio)
        assertEquals(listOf<Long>(334, 334, 333), cents(split))
        assertEquals(1001, split.totalCents)
        assertNull(split.failure)
    }
}

class NoPeopleTest {
    @Test
    fun returnsAFailureResultInsteadOfThrowing() {
        assertEquals(Split(emptyList(), 1000, SplitFailure.NO_PEOPLE), splitBill(1000, emptyList()))
    }

    @Test
    fun stillChecksTheTotalFirst() {
        val failure = assertFailsWith<IllegalArgumentException> { splitBill(-5, emptyList()) }
        assertEquals("Total must not be negative", failure.message)
    }

    @Test
    fun printsASingleLineForTheFailureResult() {
        val written = mutableListOf<String>()
        formatShares(splitBill(1000, emptyList())) { written.add(it) }
        assertEquals(listOf("Nobody to split between\n"), written)
    }

    @Test
    fun printsTheSameLineThroughTheApp() {
        val written = mutableListOf<String>()
        printSplit(1000, emptyList()) { written.add(it) }
        assertEquals(listOf("Nobody to split between\n"), written)
    }
}

class PrintedRemainderTest {
    @Test
    fun printsTheRemainderCentsOnTheFirstLines() {
        val written = mutableListOf<String>()
        formatShares(splitBill(1000, trio)) { written.add(it) }
        assertEquals(listOf("Ann  $3.34\n", "Ben  $3.33\n", "Cy   $3.33\n", "Total: $10.00\n"), written)
    }
}
