package demo.shared

fun legacyPrice(cents: Int): Int = scaled(cents)

fun legacyLabel(cents: Int): String = pad(cents.toString(), 8)
