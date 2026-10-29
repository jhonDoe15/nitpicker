package com.example.billing

private const val CENTS_PER_DOLLAR = 100

internal fun formatMoney(cents: Long): String {
    val dollars = cents / CENTS_PER_DOLLAR
    val rest = cents % CENTS_PER_DOLLAR
    return "$$dollars.${rest.toString().padStart(2, '0')}"
}
