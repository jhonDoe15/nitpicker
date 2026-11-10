package demo.app

fun shout(
    text: String,
    upper: Boolean,
): String = if (upper) text.uppercase() else text

fun loud(
    text: String,
    upper: Boolean,
): String = shout(text, upper)
