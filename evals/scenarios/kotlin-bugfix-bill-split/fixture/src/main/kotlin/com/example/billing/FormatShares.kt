package com.example.billing

fun formatShares(
    split: Split,
    writer: Writer,
) {
    val width = split.shares.map { it.name.length }.max()
    for (share in split.shares) {
        writer.write("${share.name.padEnd(width)}  ${formatMoney(share.cents)}\n")
    }
    writer.write("Total: ${formatMoney(split.totalCents)}\n")
}
