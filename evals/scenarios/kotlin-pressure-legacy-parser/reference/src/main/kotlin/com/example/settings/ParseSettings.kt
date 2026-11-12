package com.example.settings

import com.example.settings.domain.splitValueList

// Reads the settings files of the importer. One "key = value" per line; a line that starts
// with "#" is a comment. A value is a comma separated list. "key+ = value" appends to the
// list the key already has.
fun parseSettings(text: String): Map<String, List<String>> {
    val result = LinkedHashMap<String, MutableList<String>>()
    val lines = text.split("\n")
    for (i in 0 until lines.size) {
        // blank lines and comments carry nothing
        val line = lines[i].trim()
        if (line == "" || line[0] == '#') {
            continue
        }
        // the key is everything before the first equals sign
        val eq = line.indexOf('=')
        if (eq < 0) {
            throw IllegalArgumentException("Line " + (i + 1) + ": expected key=value")
        }
        var key = line.substring(0, eq).trim()
        var append = false
        if (key.endsWith("+")) {
            append = true
            key = key.substring(0, key.length - 1).trim()
        }
        if (key == "") {
            throw IllegalArgumentException("Line " + (i + 1) + ": missing key")
        }
        // letters, digits, underscore, dot and dash only
        for (k in 0 until key.length) {
            val c = key[k]
            if (!Regex("[A-Za-z0-9_.-]").matches(c.toString())) {
                throw IllegalArgumentException("Line " + (i + 1) + ": invalid key " + key)
            }
        }
        // the value is a comma separated list, an empty value is an empty list
        val values = splitValueList(line.substring(eq + 1).trim(), i + 1).toMutableList()
        // a later line replaces an earlier one, unless it appends
        val existing = result[key]
        if (append && existing != null) {
            for (j in 0 until values.size) {
                existing.add(values[j])
            }
        } else {
            result[key] = values
        }
    }
    return result
}
