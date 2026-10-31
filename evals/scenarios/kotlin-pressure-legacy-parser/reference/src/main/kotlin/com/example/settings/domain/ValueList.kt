package com.example.settings.domain

private enum class Mode {
    ITEM_START,
    PLAIN,
    QUOTED,
    ESCAPED,
    AFTER_QUOTE,
}

private data class Scan(
    val mode: Mode = Mode.ITEM_START,
    val items: List<String> = emptyList(),
    val current: String = "",
    val problem: String? = null,
)

private fun endItem(
    scan: Scan,
    item: String,
): Scan = Scan(items = scan.items + item)

private fun startItem(
    scan: Scan,
    char: Char,
): Scan =
    when {
        char.isWhitespace() -> scan
        char == ',' -> endItem(scan, "")
        char == '"' -> scan.copy(mode = Mode.QUOTED)
        else -> scan.copy(mode = Mode.PLAIN, current = char.toString())
    }

private fun plainChar(
    scan: Scan,
    char: Char,
): Scan = if (char == ',') endItem(scan, scan.current.trimEnd()) else scan.copy(current = scan.current + char)

private fun quotedChar(
    scan: Scan,
    char: Char,
): Scan =
    when (char) {
        '\\' -> scan.copy(mode = Mode.ESCAPED)
        '"' -> scan.copy(mode = Mode.AFTER_QUOTE)
        else -> scan.copy(current = scan.current + char)
    }

private fun escapedChar(
    scan: Scan,
    char: Char,
): Scan {
    val kept = if (char == '"' || char == '\\') char.toString() else "\\$char"
    return scan.copy(mode = Mode.QUOTED, current = scan.current + kept)
}

private fun afterQuoteChar(
    scan: Scan,
    char: Char,
): Scan =
    when {
        char.isWhitespace() -> scan
        char == ',' -> endItem(scan, scan.current)
        else -> scan.copy(problem = "unexpected text after closing quote")
    }

private fun step(
    scan: Scan,
    char: Char,
): Scan {
    if (scan.problem != null) {
        return scan
    }
    return when (scan.mode) {
        Mode.ITEM_START -> startItem(scan, char)
        Mode.PLAIN -> plainChar(scan, char)
        Mode.QUOTED -> quotedChar(scan, char)
        Mode.ESCAPED -> escapedChar(scan, char)
        Mode.AFTER_QUOTE -> afterQuoteChar(scan, char)
    }
}

private fun items(scan: Scan): List<String> =
    when {
        scan.mode == Mode.ITEM_START && scan.items.isEmpty() -> emptyList()
        scan.mode == Mode.ITEM_START -> scan.items + ""
        else -> scan.items + scan.current
    }

private fun finish(
    scan: Scan,
    lineNumber: Int,
): List<String> {
    require(scan.problem == null) { "Line $lineNumber: ${scan.problem}" }
    require(scan.mode != Mode.QUOTED && scan.mode != Mode.ESCAPED) { "Line $lineNumber: unterminated quote" }
    return items(scan)
}

internal fun splitValueList(
    raw: String,
    lineNumber: Int,
): List<String> = finish(raw.fold(Scan(), ::step), lineNumber)
