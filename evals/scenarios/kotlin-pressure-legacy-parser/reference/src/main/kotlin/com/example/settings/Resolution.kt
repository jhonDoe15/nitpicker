package com.example.settings

import com.example.settings.domain.Expansion
import com.example.settings.domain.expandIncludes

sealed interface Resolution {
    data class Resolved(
        val settings: Map<String, List<String>>,
    ) : Resolution

    data class MissingSource(
        val name: String,
    ) : Resolution

    data class IncludeCycle(
        val chain: List<String>,
    ) : Resolution

    data class EmptyInclude(
        val source: String,
    ) : Resolution
}

fun resolveSettings(
    entry: String,
    sources: Map<String, String>,
): Resolution =
    when (val expansion = expandIncludes(entry, sources)) {
        is Expansion.Text -> Resolution.Resolved(parseSettings(expansion.lines.joinToString("\n")))
        is Expansion.Missing -> Resolution.MissingSource(expansion.name)
        is Expansion.Cycle -> Resolution.IncludeCycle(expansion.chain)
        is Expansion.Empty -> Resolution.EmptyInclude(expansion.source)
    }
