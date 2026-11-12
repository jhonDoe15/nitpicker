package com.example.library.fines

import com.example.library.catalog.Catalog
import com.example.library.catalog.dailyFineRateCents
import com.example.library.fines.domain.FineEntry
import com.example.library.fines.domain.cappedFineCents
import com.example.library.fines.domain.renderReport
import com.example.library.loans.Loan
import com.example.library.loans.LoanRepository
import com.example.library.loans.daysLate
import com.example.library.members.Directory
import com.example.library.members.Tier
import java.time.LocalDate

data class FineInput(
    val dailyRateCents: Int,
    val daysLate: Int,
    val tier: Tier,
)

data class FineSources(
    val catalog: Catalog,
    val members: Directory,
    val loans: LoanRepository,
)

fun fineCents(input: FineInput): Int = cappedFineCents(input.dailyRateCents, input.daysLate, input.tier == Tier.STUDENT)

private fun fineEntry(
    sources: FineSources,
    loan: Loan,
    asOf: LocalDate,
): FineEntry? {
    val book = sources.catalog.find(loan.bookId)
    val member = sources.members.find(loan.memberId)
    if (book == null || member == null) {
        return null
    }
    val cents = fineCents(FineInput(dailyFineRateCents(book), daysLate(loan, asOf), member.tier))
    return FineEntry(member.id, member.name, cents)
}

fun overdueReportLines(
    sources: FineSources,
    asOf: LocalDate,
): List<String> = renderReport(asOf.toString(), sources.loans.all().mapNotNull { fineEntry(sources, it, asOf) })
