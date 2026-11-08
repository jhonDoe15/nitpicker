package com.example.library.fines.domain

private const val CAP_DAYS = 20

internal fun cappedFineCents(
    dailyRateCents: Int,
    daysLate: Int,
    student: Boolean,
): Int {
    val fullFine = minOf(daysLate, CAP_DAYS) * dailyRateCents
    return if (student) fullFine / 2 else fullFine
}
