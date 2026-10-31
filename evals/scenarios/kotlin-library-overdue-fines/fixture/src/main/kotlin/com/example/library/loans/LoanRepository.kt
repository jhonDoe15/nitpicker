package com.example.library.loans

import com.example.library.loans.adapters.InMemoryLoans

interface LoanRepository {
    fun all(): List<Loan>

    fun forMember(memberId: String): List<Loan>
}

fun inMemoryLoans(loans: List<Loan>): LoanRepository = InMemoryLoans(loans)
