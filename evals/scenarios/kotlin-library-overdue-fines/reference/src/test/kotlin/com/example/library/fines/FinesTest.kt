package com.example.library.fines

import com.example.library.app.Writer
import com.example.library.app.execute
import com.example.library.app.overdueReportMain
import com.example.library.catalog.Book
import com.example.library.catalog.Category
import com.example.library.catalog.inMemoryCatalog
import com.example.library.loans.Loan
import com.example.library.loans.inMemoryLoans
import com.example.library.members.Member
import com.example.library.members.Tier
import com.example.library.members.inMemoryMembers
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

private fun fine(
    rate: Int,
    days: Int,
    tier: Tier,
): Int = fineCents(FineInput(rate, days, tier))

class FineCentsTest {
    @Test
    fun chargesTheDailyRateForEachDayLate() {
        assertEquals(75, fine(25, 3, Tier.STANDARD))
        assertEquals(0, fine(25, 0, Tier.STANDARD))
    }

    @Test
    fun halvesTheFineForStudentsRoundingDown() {
        assertEquals(37, fine(25, 3, Tier.STUDENT))
        assertEquals(10, fine(10, 2, Tier.STUDENT))
        assertEquals(0, fine(1, 1, Tier.STUDENT))
    }

    @Test
    fun capsTheFineAtTwentyDaysOfTheRateBeforeAnyDiscount() {
        assertEquals(475, fine(25, 19, Tier.STANDARD))
        assertEquals(500, fine(25, 20, Tier.STANDARD))
        assertEquals(500, fine(25, 21, Tier.STANDARD))
        assertEquals(250, fine(25, 90, Tier.STUDENT))
        assertEquals(237, fine(25, 19, Tier.STUDENT))
    }
}

private val catalog =
    inMemoryCatalog(
        listOf(Book("B1", "Dune", Category.NOVEL), Book("B2", "World Atlas", Category.REFERENCE)),
    )
private val members =
    inMemoryMembers(
        listOf(
            Member("M1", "Zed", Tier.STANDARD),
            Member("M2", "Amy", Tier.STANDARD),
            Member("M3", "Kim", Tier.STUDENT),
        ),
    )

private fun loan(
    bookId: String,
    memberId: String,
    dueOn: String,
    returnedOn: String? = null,
): Loan =
    Loan(
        bookId,
        memberId,
        LocalDate.parse("2026-01-01"),
        LocalDate.parse(dueOn),
        returnedOn?.let { LocalDate.parse(it) },
    )

private fun report(
    loans: List<Loan>,
    asOf: String,
): List<String> = overdueReportLines(FineSources(catalog, members, inMemoryLoans(loans)), LocalDate.parse(asOf))

class OverdueReportLinesTest {
    @Test
    fun totalsEachMemberRankedByTotalThenName() {
        val lines =
            report(
                listOf(
                    loan("B1", "M1", "2026-03-08"),
                    loan("B1", "M1", "2026-03-09"),
                    loan("B1", "M2", "2026-03-07"),
                    loan("B2", "M3", "2026-03-05"),
                    loan("B1", "M3", "2026-03-10"),
                ),
                "2026-03-10",
            )
        assertEquals(
            listOf("Overdue fines as of 2026-03-10", "Kim: $2.50", "Amy: $0.75", "Zed: $0.75"),
            lines,
        )
    }

    @Test
    fun keepsTheFinalFineOfALoanReturnedLate() {
        assertEquals(
            listOf("Overdue fines as of 2026-03-30", "Zed: $0.50"),
            report(listOf(loan("B1", "M1", "2026-03-01", "2026-03-03")), "2026-03-30"),
        )
    }

    @Test
    fun skipsLoansThatAreNotLateOrWhoseBookOrMemberIsUnknown() {
        val loans =
            listOf(
                loan("B1", "M1", "2026-03-10"),
                loan("B1", "M2", "2026-03-01", "2026-03-01"),
                loan("B9", "M1", "2026-03-01"),
                loan("B1", "M9", "2026-03-01"),
            )
        assertEquals(listOf("Overdue fines as of 2026-03-10", "No overdue fines"), report(loans, "2026-03-10"))
    }
}

private fun printed(action: (Writer) -> Unit): String {
    val text = StringBuilder()
    action { text.append(it) }
    return text.toString()
}

class OverdueReportMainTest {
    @Test
    fun printsTheReportForTheSeededLibrary() {
        assertEquals(
            "Overdue fines as of 2026-03-31\nBarbara Lane: $11.00\nGrace Mill: $10.62\nAlan Fox: $5.00\n" +
                "Brian Cole: $5.00\nAda Stone: $2.05\nEdgar Dunn: $0.05\n",
            printed { overdueReportMain("2026-03-31", it) },
        )
    }

    @Test
    fun printsTheReportForALaterDate() {
        assertEquals(
            "Overdue fines as of 2026-04-10\nBarbara Lane: $16.30\nGrace Mill: $11.87\nAlan Fox: $6.00\n" +
                "Ada Stone: $5.55\nBrian Cole: $5.00\nEdgar Dunn: $1.80\n",
            printed { overdueReportMain("2026-04-10", it) },
        )
    }

    @Test
    fun printsTheReportForAnEarlierDate() {
        assertEquals(
            "Overdue fines as of 2026-03-25\nGrace Mill: $7.50\nBarbara Lane: $5.00\nBrian Cole: $4.75\n" +
                "Alan Fox: $3.50\nAda Stone: $0.25\n",
            printed { overdueReportMain("2026-03-25", it) },
        )
    }

    @Test
    fun saysSoWhenNothingIsOverdue() {
        assertEquals(
            "Overdue fines as of 2026-03-06\nNo overdue fines\n",
            printed { overdueReportMain("2026-03-06", it) },
        )
    }

    @Test
    fun runsAsTheOverdueCommand() {
        assertEquals(
            printed { overdueReportMain("2026-03-31", it) },
            printed { execute(listOf("overdue", "2026-03-31"), it) },
        )
    }
}
