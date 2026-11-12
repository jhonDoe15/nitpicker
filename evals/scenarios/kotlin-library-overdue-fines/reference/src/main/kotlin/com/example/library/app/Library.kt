package com.example.library.app

import com.example.library.catalog.describeBook
import com.example.library.catalog.inMemoryCatalog
import com.example.library.fines.FineSources
import com.example.library.fines.overdueReportLines
import com.example.library.loans.describeLoan
import com.example.library.loans.inMemoryLoans
import com.example.library.members.inMemoryMembers
import java.time.LocalDate

private val catalog = inMemoryCatalog(seededBooks)
private val directory = inMemoryMembers(seededMembers)
private val repository = inMemoryLoans(seededLoans)

private fun printLines(
    lines: List<String>,
    writer: Writer,
) {
    for (line in lines) {
        writer.write("$line\n")
    }
}

private fun titleOf(bookId: String): String = catalog.find(bookId)?.title ?: bookId

fun catalogMain(writer: Writer) {
    printLines(catalog.all().map { describeBook(it) }, writer)
}

fun loansMain(
    asOf: String,
    writer: Writer,
) {
    val date = LocalDate.parse(asOf)
    printLines(
        repository.all().map { "${it.memberId}: ${describeLoan(titleOf(it.bookId), it, date)}" },
        writer,
    )
}

fun memberLoansMain(
    memberId: String,
    asOf: String,
    writer: Writer,
) {
    val member = directory.find(memberId)
    if (member == null) {
        printLines(listOf("Unknown member $memberId"), writer)
        return
    }
    val date = LocalDate.parse(asOf)
    val lines = repository.forMember(memberId).map { describeLoan(titleOf(it.bookId), it, date) }
    printLines(listOf("Loans for ${member.name}") + lines, writer)
}

fun overdueReportMain(
    asOf: String,
    writer: Writer,
) {
    printLines(overdueReportLines(FineSources(catalog, directory, repository), LocalDate.parse(asOf)), writer)
}
