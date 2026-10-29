package com.example.settings

fun printSettings(
    text: String,
    writer: Writer,
) {
    val settings = parseSettings(text)
    for (key in settings.keys.sorted()) {
        writer.write("$key = ${settings.getValue(key).joinToString(", ")}\n")
    }
}
