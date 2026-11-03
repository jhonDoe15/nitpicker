package com.example.app

import com.example.settings.Writer
import com.example.settings.printSettings
import java.nio.file.Path
import kotlin.io.path.readText

fun printEntry(
    entry: Path,
    writer: Writer,
) {
    printSettings(entry.readText(), writer)
}

fun main(args: Array<String>) {
    printEntry(Path.of(args[0]), Writer { System.out.print(it) })
}
