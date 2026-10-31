package com.example.settings

private fun writeSettings(
    settings: Map<String, List<String>>,
    writer: Writer,
) {
    for (key in settings.keys.sorted()) {
        writer.write("$key = ${settings.getValue(key).joinToString(", ")}\n")
    }
}

fun printSettings(
    text: String,
    writer: Writer,
) {
    writeSettings(parseSettings(text), writer)
}

fun printResolved(
    entry: String,
    sources: Map<String, String>,
    writer: Writer,
) {
    when (val resolution = resolveSettings(entry, sources)) {
        is Resolution.Resolved -> writeSettings(resolution.settings, writer)
        is Resolution.MissingSource -> writer.write("Missing source ${resolution.name}\n")
        is Resolution.IncludeCycle -> writer.write("Include cycle: ${resolution.chain.joinToString(" -> ")}\n")
        is Resolution.EmptyInclude -> writer.write("Empty include in ${resolution.source}\n")
    }
}
