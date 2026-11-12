package demo.shared

fun scaled(cents: Int): Int = cents * 2

fun price(cents: Int): Int = scaled(cents)

internal fun pad(
    text: String,
    width: Int = 4,
): String = text.padStart(width)

fun label(cents: Int): String = pad(price(cents).toString())

fun greet(
    name: String,
    loud: Boolean = false,
): String = if (loud) name.uppercase() else name
