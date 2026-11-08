package com.example.library.loans.adapters

import com.example.library.loans.Loan
import com.example.library.loans.LoanRepository

internal class InMemoryLoans(
    private val loans: List<Loan>,
) : LoanRepository {
    override fun all(): List<Loan> = loans

    override fun forMember(memberId: String): List<Loan> = loans.filter { it.memberId == memberId }
}
