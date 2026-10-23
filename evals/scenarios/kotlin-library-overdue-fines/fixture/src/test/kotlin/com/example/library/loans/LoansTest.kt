package com.example.library.loans

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

private fun day(iso: String): LocalDate = LocalDate.parse(iso)

private val open = Loan("B1", "M1", day("2026-03-01"), day("2026-03-15"))
private val returnedLate = open.copy(returnedOn = day("2026-03-18"))
private val returnedOnTime = open.copy(returnedOn = day("2026-03-12"))

class DaysLateTest {
    @Test
    fun isZeroUntilTheDayAfterTheDueDate() {
        assertEquals(0, daysLate(open, day("2026-03-10")))
        assertEquals(0, daysLate(open, day("2026-03-15")))
        assertEquals(1, daysLate(open, day("2026-03-16")))
    }

    @Test
    fun countsAcrossMonthAndLeapDayBoundaries() {
        assertEquals(4, daysLate(open.copy(dueOn = day("2028-02-27")), day("2028-03-02")))
        assertEquals(3, daysLate(open.copy(dueOn = day("2026-02-27")), day("2026-03-02")))
    }

    @Test
    fun stopsCountingAtTheReturnDate() {
        assertEquals(3, daysLate(returnedLate, day("2026-04-30")))
        assertEquals(3, daysLate(returnedLate, day("2026-03-18")))
        assertEquals(0, daysLate(returnedOnTime, day("2026-04-30")))
    }

    @Test
    fun treatsALoanReturnedAfterTheDateAsStillOut() {
        assertEquals(2, daysLate(returnedLate, day("2026-03-17")))
        assertEquals(0, daysLate(returnedLate, day("2026-03-10")))
    }
}

class DescribeLoanTest {
    @Test
    fun showsALoanThatIsNotLate() {
        assertEquals("Dune: borrowed 2026-03-01, due 2026-03-15", describeLoan("Dune", open, day("2026-03-15")))
    }

    @Test
    fun showsALateLoanWithItsDays() {
        assertEquals(
            "Dune: borrowed 2026-03-01, due 2026-03-15, 5d late",
            describeLoan("Dune", open, day("2026-03-20")),
        )
    }

    @Test
    fun showsAReturnedLoanOnceTheReturnDateHasCome() {
        assertEquals(
            "Dune: borrowed 2026-03-01, returned 2026-03-18",
            describeLoan("Dune", returnedLate, day("2026-03-20")),
        )
        assertEquals(
            "Dune: borrowed 2026-03-01, returned 2026-03-18",
            describeLoan("Dune", returnedLate, day("2026-03-18")),
        )
    }

    @Test
    fun showsALoanReturnedAfterTheDateAsStillOut() {
        assertEquals(
            "Dune: borrowed 2026-03-01, due 2026-03-15, 2d late",
            describeLoan("Dune", returnedLate, day("2026-03-17")),
        )
    }
}

class LoanRepositoryTest {
    @Test
    fun listsLoansAllOrPerMember() {
        val other = open.copy(memberId = "M2")
        val repository = inMemoryLoans(listOf(open, other))
        assertEquals(listOf(open, other), repository.all())
        assertEquals(listOf(other), repository.forMember("M2"))
        assertEquals(emptyList(), repository.forMember("M3"))
    }
}
