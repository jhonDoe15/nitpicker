package com.example.library.fines.domain

private const val CENTS_PER_DOLLAR = 100

internal data class FineEntry(
    val memberId: String,
    val name: String,
    val cents: Int,
)

private data class MemberTotal(
    val name: String,
    val cents: Int,
)

private fun formatCents(cents: Int): String {
    val rest = (cents % CENTS_PER_DOLLAR).toString().padStart(2, '0')
    return "$${cents / CENTS_PER_DOLLAR}.$rest"
}

private fun totalsOf(entries: List<FineEntry>): List<MemberTotal> =
    entries
        .groupBy { it.memberId }
        .values
        .map { own -> MemberTotal(own.first().name, own.sumOf { it.cents }) }
        .filter { it.cents > 0 }

internal fun renderReport(
    asOf: String,
    entries: List<FineEntry>,
): List<String> {
    val header = "Overdue fines as of $asOf"
    val totals = totalsOf(entries)
    if (totals.isEmpty()) {
        return listOf(header, "No overdue fines")
    }
    val ranked = totals.sortedWith(compareByDescending<MemberTotal> { it.cents }.thenBy { it.name })
    return listOf(header) + ranked.map { "${it.name}: ${formatCents(it.cents)}" }
}
