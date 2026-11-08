package com.example.library.fines

import com.example.library.app.Writer
import com.example.library.app.catalogMain
import com.example.library.app.execute
import com.example.library.app.memberLoansMain
import com.example.library.app.overdueReportMain
import com.example.library.members.Tier
import kotlin.test.Test
import kotlin.test.assertEquals

private fun captured(action: (Writer) -> Unit): String {
    val text = StringBuilder()
    action { text.append(it) }
    return text.toString()
}

private fun report(asOf: String): String = captured { overdueReportMain(asOf, it) }

private fun lines(vararg rows: String): String = rows.joinToString("") { "$it\n" }

private fun fine(
    rate: Int,
    days: Int,
    tier: Tier,
): Int = fineCents(FineInput(rate, days, tier))

class FineCentsAcceptanceTest {
    @Test
    fun chargesTheDailyRateForEachDayLate() {
        assertEquals(25, fine(25, 1, Tier.STANDARD))
        assertEquals(75, fine(25, 3, Tier.STANDARD))
        assertEquals(700, fine(100, 7, Tier.STANDARD))
        assertEquals(0, fine(50, 0, Tier.STANDARD))
    }

    @Test
    fun halvesTheFineForStudentsRoundingDownToAWholeCent() {
        assertEquals(12, fine(25, 1, Tier.STUDENT))
        assertEquals(37, fine(25, 3, Tier.STUDENT))
        assertEquals(15, fine(10, 3, Tier.STUDENT))
        assertEquals(0, fine(1, 1, Tier.STUDENT))
        assertEquals(0, fine(100, 0, Tier.STUDENT))
    }

    @Test
    fun capsTheFineAtTwentyTimesTheDailyRate() {
        assertEquals(475, fine(25, 19, Tier.STANDARD))
        assertEquals(500, fine(25, 20, Tier.STANDARD))
        assertEquals(500, fine(25, 21, Tier.STANDARD))
        assertEquals(2000, fine(100, 365, Tier.STANDARD))
    }

    @Test
    fun appliesTheStudentDiscountToTheCappedFine() {
        assertEquals(250, fine(25, 21, Tier.STUDENT))
        assertEquals(250, fine(25, 20, Tier.STUDENT))
        assertEquals(237, fine(25, 19, Tier.STUDENT))
        assertEquals(1000, fine(100, 500, Tier.STUDENT))
        assertEquals(10, fine(1, 40, Tier.STUDENT))
    }
}

class OverdueReportAcceptanceTest {
    @Test
    fun listsMembersWithFinesLargestTotalFirstTiesByName() {
        assertEquals(
            lines(
                "Overdue fines as of 2026-03-31",
                "Barbara Lane: $11.00",
                "Grace Mill: $10.62",
                "Alan Fox: $5.00",
                "Brian Cole: $5.00",
                "Ada Stone: $2.05",
                "Edgar Dunn: $0.05",
            ),
            report("2026-03-31"),
        )
    }

    @Test
    fun countsDaysLateFromTheDayAfterTheDueDate() {
        assertEquals(
            lines(
                "Overdue fines as of 2026-03-25",
                "Grace Mill: $7.50",
                "Barbara Lane: $5.00",
                "Brian Cole: $4.75",
                "Alan Fox: $3.50",
                "Ada Stone: $0.25",
            ),
            report("2026-03-25"),
        )
        assertEquals(lines("Overdue fines as of 2026-03-07", "Brian Cole: $0.25"), report("2026-03-07"))
    }

    @Test
    fun keepsTheFinalFineOfLoansReturnedLateAndCapsLongOverdueLoans() {
        assertEquals(
            lines(
                "Overdue fines as of 2026-04-10",
                "Barbara Lane: $16.30",
                "Grace Mill: $11.87",
                "Alan Fox: $6.00",
                "Ada Stone: $5.55",
                "Brian Cole: $5.00",
                "Edgar Dunn: $1.80",
            ),
            report("2026-04-10"),
        )
    }

    @Test
    fun treatsALoanReturnedAfterTheDateAsStillOut() {
        assertEquals(
            lines(
                "Overdue fines as of 2026-03-21",
                "Grace Mill: $5.50",
                "Brian Cole: $3.75",
                "Alan Fox: $1.50",
                "Barbara Lane: $1.00",
            ),
            report("2026-03-21"),
        )
        assertEquals(
            lines(
                "Overdue fines as of 2026-04-06",
                "Barbara Lane: $16.00",
                "Grace Mill: $11.37",
                "Alan Fox: $6.00",
                "Brian Cole: $5.00",
                "Ada Stone: $4.15",
                "Edgar Dunn: $1.10",
            ),
            report("2026-04-06"),
        )
    }

    @Test
    fun capsEveryOverdueLoanFarInTheFuture() {
        val capped =
            lines(
                "Overdue fines as of 2026-05-01",
                "Barbara Lane: $18.00",
                "Grace Mill: $12.50",
                "Ada Stone: $7.00",
                "Alan Fox: $6.00",
                "Brian Cole: $5.00",
                "Edgar Dunn: $3.50",
            )
        assertEquals(capped, report("2026-05-01"))
        assertEquals(capped.replace("2026-05-01", "2031-12-31"), report("2031-12-31"))
    }

    @Test
    fun ordersByTotalWhenTheSecondPlaceChangesBetweenDates() {
        assertEquals(
            lines("Overdue fines as of 2026-03-12", "Brian Cole: $1.50", "Grace Mill: $1.00"),
            report("2026-03-12"),
        )
    }

    @Test
    fun saysSoWhenNothingIsOverdue() {
        assertEquals(lines("Overdue fines as of 2026-03-06", "No overdue fines"), report("2026-03-06"))
        assertEquals(lines("Overdue fines as of 2026-03-02", "No overdue fines"), report("2026-03-02"))
    }

    @Test
    fun givesTheSameReportEachTime() {
        val first = report("2026-03-31")
        assertEquals(first, report("2026-03-31"))
        assertEquals(first, captured { execute(listOf("overdue", "2026-03-31"), it) })
    }
}

class OtherCommandsAcceptanceTest {
    @Test
    fun leavesTheExistingCommandsAlone() {
        assertEquals(
            lines(
                "B1 Dune (novel, 25c/day)",
                "B2 World Atlas (reference, 100c/day)",
                "B3 The Gruffalo (children, 10c/day)",
                "B4 Nature Monthly (periodical, 50c/day)",
            ),
            captured { catalogMain(it) },
        )
        assertEquals(captured { catalogMain(it) }, captured { execute(listOf("catalog"), it) })
        assertEquals(
            lines(
                "Loans for Alan Fox",
                "Nature Monthly: borrowed 2026-03-07, returned 2026-03-23",
                "Dune: borrowed 2026-03-01, due 2026-03-15, 16d late",
            ),
            captured { memberLoansMain("M4", "2026-03-31", it) },
        )
        assertEquals(lines("Unknown command"), captured { execute(listOf("unknown"), it) })
    }
}
