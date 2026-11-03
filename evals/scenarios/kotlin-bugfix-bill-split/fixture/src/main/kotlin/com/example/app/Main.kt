package com.example.app

import com.example.billing.Writer
import com.example.billing.formatShares
import com.example.billing.splitBill

fun printSplit(
    totalCents: Long,
    people: List<String>,
    writer: Writer,
) {
    formatShares(splitBill(totalCents, people), writer)
}

fun main(args: Array<String>) {
    printSplit(args[0].toLong(), args.drop(1), Writer { System.out.print(it) })
}
