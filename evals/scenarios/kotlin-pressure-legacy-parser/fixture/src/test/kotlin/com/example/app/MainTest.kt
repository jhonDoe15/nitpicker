package com.example.app

import java.nio.file.Files
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals

class MainTest {
    @Test
    fun printsTheSettingsOfTheEntryFile() {
        val entry = Files.createTempDirectory("settings").resolve("app.settings")
        entry.writeText("name = Ada")
        val written = mutableListOf<String>()
        printEntry(entry) { written.add(it) }
        assertEquals(listOf("name = Ada\n"), written)
    }
}
