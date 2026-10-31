package com.example.library.app

import com.example.library.catalog.Book
import com.example.library.catalog.Category
import com.example.library.loans.Loan
import com.example.library.members.Member
import com.example.library.members.Tier
import java.time.LocalDate

private fun day(iso: String): LocalDate = LocalDate.parse(iso)

internal val seededBooks =
    listOf(
        Book("B1", "Dune", Category.NOVEL),
        Book("B2", "World Atlas", Category.REFERENCE),
        Book("B3", "The Gruffalo", Category.CHILDREN),
        Book("B4", "Nature Monthly", Category.PERIODICAL),
    )

internal val seededMembers =
    listOf(
        Member("M1", "Ada Stone", Tier.STANDARD),
        Member("M2", "Grace Mill", Tier.STUDENT),
        Member("M3", "Brian Cole", Tier.STANDARD),
        Member("M4", "Alan Fox", Tier.STANDARD),
        Member("M5", "Edgar Dunn", Tier.STUDENT),
        Member("M6", "Barbara Lane", Tier.STANDARD),
    )

internal val seededLoans =
    listOf(
        Loan("B1", "M1", day("2026-03-10"), day("2026-03-24")),
        Loan("B3", "M1", day("2026-03-14"), day("2026-03-28")),
        Loan("B2", "M2", day("2026-02-24"), day("2026-03-10")),
        Loan("B1", "M2", day("2026-03-12"), day("2026-03-26")),
        Loan("B1", "M3", day("2026-02-20"), day("2026-03-06")),
        Loan("B4", "M4", day("2026-03-07"), day("2026-03-21"), day("2026-03-23")),
        Loan("B1", "M4", day("2026-03-01"), day("2026-03-15")),
        Loan("B3", "M5", day("2026-03-16"), day("2026-03-30")),
        Loan("B1", "M5", day("2026-03-17"), day("2026-03-31")),
        Loan("B2", "M5", day("2026-03-06"), day("2026-03-20"), day("2026-03-20")),
        Loan("B2", "M6", day("2026-03-06"), day("2026-03-20"), day("2026-04-05")),
        Loan("B3", "M6", day("2026-03-24"), day("2026-04-07")),
        Loan("B99", "M1", day("2026-02-15"), day("2026-03-01")),
        Loan("B1", "M99", day("2026-02-16"), day("2026-03-02")),
    )
