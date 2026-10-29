package com.example.app

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.createDirectory
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals

private fun printed(entry: Path): List<String> {
    val written = mutableListOf<String>()
    printEntry(entry) { written.add(it) }
    return written
}

class MainTest {
    @Test
    fun printsTheSettingsOfTheEntryFile() {
        val entry = Files.createTempDirectory("settings").resolve("app.settings")
        entry.writeText("name = Ada")
        assertEquals(listOf("name = Ada\n"), printed(entry))
    }

    @Test
    fun includesTheOtherFilesNextToTheEntry() {
        val directory = Files.createTempDirectory("settings")
        directory.resolve("base.settings").writeText("lang = en\ncolor = red")
        directory.resolve("app.settings").writeText("name = Ada\ninclude = base.settings\nlang = fr")
        directory.resolve("nested").createDirectory()
        assertEquals(listOf("color = red\n", "lang = fr\n", "name = Ada\n"), printed(directory.resolve("app.settings")))
    }

    @Test
    fun printsAMissingIncludeAsOneLine() {
        val entry = Files.createTempDirectory("settings").resolve("app.settings")
        entry.writeText("include = nowhere.settings")
        assertEquals(listOf("Missing source nowhere.settings\n"), printed(entry))
    }

    @Test
    fun doesNotIncludeADirectory() {
        val directory = Files.createTempDirectory("settings")
        directory.resolve("nested").createDirectory()
        directory.resolve("app.settings").writeText("include = nested")
        assertEquals(listOf("Missing source nested\n"), printed(directory.resolve("app.settings")))
    }
}
