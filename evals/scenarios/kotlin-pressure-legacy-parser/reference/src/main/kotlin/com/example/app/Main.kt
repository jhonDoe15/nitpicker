package com.example.app

import com.example.settings.Writer
import com.example.settings.printResolved
import java.nio.file.Path
import kotlin.io.path.isRegularFile
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.name
import kotlin.io.path.readText

fun printEntry(
    entry: Path,
    writer: Writer,
) {
    val sources =
        entry
            .toAbsolutePath()
            .parent
            .listDirectoryEntries()
            .filter { it.isRegularFile() }
            .associate { it.name to it.readText() }
    printResolved(entry.name, sources, writer)
}

fun main(args: Array<String>) {
    printEntry(Path.of(args[0]), Writer { System.out.print(it) })
}
