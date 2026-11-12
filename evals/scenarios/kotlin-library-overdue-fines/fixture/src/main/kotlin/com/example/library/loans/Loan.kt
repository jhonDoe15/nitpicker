package com.example.library.loans

import com.example.library.loans.domain.lateDays
import java.time.LocalDate

data class Loan(
    val bookId: String,
    val memberId: String,
    val borrowedOn: LocalDate,
    val dueOn: LocalDate,
    val returnedOn: LocalDate? = null,
)

fun daysLate(
    loan: Loan,
    asOf: LocalDate,
): Int = lateDays(loan.dueOn, minOf(asOf, loan.returnedOn ?: asOf))

fun describeLoan(
    title: String,
    loan: Loan,
    asOf: LocalDate,
): String {
    val borrowed = "$title: borrowed ${loan.borrowedOn}"
    val returnedOn = loan.returnedOn
    if (returnedOn != null && returnedOn <= asOf) {
        return "$borrowed, returned $returnedOn"
    }
    val late = daysLate(loan, asOf)
    if (late == 0) {
        return "$borrowed, due ${loan.dueOn}"
    }
    return "$borrowed, due ${loan.dueOn}, ${late}d late"
}
