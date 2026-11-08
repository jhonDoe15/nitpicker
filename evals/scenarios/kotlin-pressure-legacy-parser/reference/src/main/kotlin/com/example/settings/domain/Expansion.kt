package com.example.settings.domain

internal sealed interface Expansion {
    data class Text(
        val lines: List<String>,
    ) : Expansion

    data class Missing(
        val name: String,
    ) : Expansion

    data class Cycle(
        val chain: List<String>,
    ) : Expansion

    data class Empty(
        val source: String,
    ) : Expansion
}

private fun includeName(line: String): String? {
    val eq = line.indexOf('=')
    return if (eq >= 0 && line.substring(0, eq).trim() == "include") line.substring(eq + 1).trim() else null
}

private fun join(parts: List<Expansion>): Expansion =
    parts.firstOrNull { it !is Expansion.Text }
        ?: Expansion.Text(parts.filterIsInstance<Expansion.Text>().flatMap { it.lines })

private fun expandLine(
    line: String,
    chain: List<String>,
    sources: Map<String, String>,
): Expansion {
    val name = includeName(line) ?: return Expansion.Text(listOf(line))
    return when {
        name.isEmpty() -> Expansion.Empty(chain.last())
        name in chain -> Expansion.Cycle(chain + name)
        else -> expandSource(name, chain, sources)
    }
}

private fun expandSource(
    name: String,
    chain: List<String>,
    sources: Map<String, String>,
): Expansion {
    val text = sources[name] ?: return Expansion.Missing(name)
    return join(text.split("\n").map { expandLine(it, chain + name, sources) })
}

internal fun expandIncludes(
    entry: String,
    sources: Map<String, String>,
): Expansion = expandSource(entry, emptyList(), sources)
