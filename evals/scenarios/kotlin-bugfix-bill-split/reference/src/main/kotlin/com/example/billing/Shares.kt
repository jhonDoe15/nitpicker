package com.example.billing

internal fun shareCents(
    totalCents: Long,
    count: Int,
    position: Int,
): Long {
    val base = totalCents / count
    return if (position < totalCents % count) base + 1 else base
}

internal fun splitOf(
    shares: List<Share>,
    totalCents: Long,
): Split = Split(shares, totalCents, if (shares.isEmpty()) SplitFailure.NO_PEOPLE else null)
